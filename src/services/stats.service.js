const { Op, fn, col, literal } = require('sequelize');
const {
  User, Specimen, Category, Type, Analysis, CollectionItem, Achievement, UserAchievement,
  UserQuizAttempt, Quiz, Feedback
} = require('../models');
const GuestQuotaService = require('./guest_quota.service');
const { FEEDBACK_RATINGS } = require('../config/constants');

const DEFAULT_ACTIVITY_LIMIT = 20;

const percentage = (part, total, decimals = 0) => {
  if (!total) return 0;
  const factor = 10 ** decimals;
  return Math.round((part / total) * 100 * factor) / factor;
};

/** Counts by a column: `[{ status: 'active', total: '3' }]` -> `{ active: 3 }`. */
const countsToMap = (rows, key) => Object.fromEntries(rows.map((row) => [row[key], Number(row.total)]));

class StatsService {
  /**
   * Discovery progress of one taxonomy (categories or types): how many catalog
   * entries exist in each group and how many the user has found.
   */
  static taxonomyBreakdown(groups, idField, activeSpecimens, discoveredIds) {
    return Object.fromEntries(groups.map((group) => {
      const members = activeSpecimens.filter((specimen) => specimen[idField] === group.id);
      const discovered = members.filter((specimen) => discoveredIds.has(specimen.id)).length;
      return [group.name, {
        id: group.id,
        total: members.length,
        discovered,
        percentage: percentage(discovered, members.length)
      }];
    }));
  }

  /**
   * Chronological feed (newest first) of what a user did: recognitions, new
   * discoveries, unlocked achievements, quizzes and feedback.
   */
  static async getActivityHistory(userId, limit = DEFAULT_ACTIVITY_LIMIT) {
    const newestFirst = (field) => [[field, 'DESC']];

    const [analyses, discoveries, achievements, quizzes, feedback] = await Promise.all([
      Analysis.findAll({
        where: { user_id: userId },
        attributes: ['id', 'createdAt', 'ai_confidence', 'provider_used'],
        include: [{ model: Specimen, as: 'primary_specimen', attributes: ['id', 'name_es'] }],
        order: newestFirst('createdAt'),
        limit
      }),
      CollectionItem.findAll({
        where: { user_id: userId },
        attributes: ['id', 'discovered_at'],
        include: [{ model: Specimen, as: 'specimen', attributes: ['id', 'name_es'] }],
        order: newestFirst('discovered_at'),
        limit
      }),
      UserAchievement.findAll({
        where: { user_id: userId, is_unlocked: true },
        attributes: ['id', 'unlocked_at'],
        include: [{ model: Achievement, as: 'achievement', attributes: ['code', 'title'] }],
        order: newestFirst('unlocked_at'),
        limit
      }),
      UserQuizAttempt.findAll({
        where: { user_id: userId },
        attributes: ['id', 'completed_at', 'score', 'passed'],
        include: [{ model: Quiz, as: 'quiz', attributes: ['id', 'title'] }],
        order: newestFirst('completed_at'),
        limit
      }),
      Feedback.findAll({
        where: { user_id: userId },
        attributes: ['id', 'createdAt', 'rating', 'analysis_id'],
        order: newestFirst('createdAt'),
        limit
      })
    ]);

    const events = [
      ...analyses.map((analysis) => ({
        type: 'recognition',
        occurred_at: analysis.createdAt,
        analysis_id: analysis.id,
        specimen: analysis.primary_specimen,
        confidence: analysis.ai_confidence,
        provider: analysis.provider_used
      })),
      ...discoveries.map((item) => ({
        type: 'discovery',
        occurred_at: item.discovered_at,
        specimen: item.specimen
      })),
      ...achievements.map((record) => ({
        type: 'achievement_unlocked',
        occurred_at: record.unlocked_at,
        achievement: record.achievement
      })),
      ...quizzes.map((attempt) => ({
        type: 'quiz_completed',
        occurred_at: attempt.completed_at,
        quiz: attempt.quiz,
        score: attempt.score,
        passed: attempt.passed
      })),
      ...feedback.map((entry) => ({
        type: 'feedback_sent',
        occurred_at: entry.createdAt,
        analysis_id: entry.analysis_id,
        rating: entry.rating
      }))
    ];

    return events
      .sort((a, b) => new Date(b.occurred_at) - new Date(a.occurred_at))
      .slice(0, limit);
  }

  /**
   * Progress and statistics of one user. Works for registered accounts and guest
   * sessions alike (a guest also sees how many recognitions are left).
   */
  static async getUserProgress(user, { activityLimit = DEFAULT_ACTIVITY_LIMIT } = {}) {
    const userId = user.id;

    const [
      activeSpecimens, collectionItems, categories, types,
      totalRecognitions, unlockedAchievements, availableAchievements, activityHistory
    ] = await Promise.all([
      Specimen.findAll({ where: { is_active: true }, attributes: ['id', 'category_id', 'type_id'] }),
      CollectionItem.findAll({ where: { user_id: userId }, attributes: ['specimen_id'] }),
      Category.findAll({ order: [['name', 'ASC']] }),
      Type.findAll({ order: [['name', 'ASC']] }),
      Analysis.count({ where: { user_id: userId } }),
      UserAchievement.count({ where: { user_id: userId, is_unlocked: true } }),
      Achievement.count({ where: { is_active: true } }),
      StatsService.getActivityHistory(userId, activityLimit)
    ]);

    // Only entries of the current (active) catalog count towards the percentage.
    const discoveredIds = new Set(collectionItems.map((item) => item.specimen_id));
    const totalSpecimens = activeSpecimens.length;
    const totalDiscovered = activeSpecimens.filter((specimen) => discoveredIds.has(specimen.id)).length;

    return {
      total_specimens: totalSpecimens,
      total_discovered: totalDiscovered,
      overall_percentage: percentage(totalDiscovered, totalSpecimens),
      categories: StatsService.taxonomyBreakdown(categories, 'category_id', activeSpecimens, discoveredIds),
      types: StatsService.taxonomyBreakdown(types, 'type_id', activeSpecimens, discoveredIds),
      total_recognitions: totalRecognitions,
      total_achievements_unlocked: unlockedAchievements,
      total_achievements_available: availableAchievements,
      experience: {
        level: user.current_level,
        experience_points: user.experience_points
      },
      guest_quota: user.is_anonymous ? await GuestQuotaService.usage(userId) : null,
      activity_history: activityHistory
    };
  }

  /**
   * Platform-wide figures for the administrator dashboard.
   * @param {{ top?: number }} [options] Size of the "most recognised rocks" ranking.
   */
  static async getGlobalStats({ top = 5 } = {}) {
    const [
      registeredUsers, guestSessions, usersByStatus, usersByRole,
      totalRecognitions, catalogSize, totalDiscoveries, ranking,
      feedbackByRating, achievementsDefined, achievementsActive, achievementsUnlocked
    ] = await Promise.all([
      User.count({ where: { is_anonymous: false } }),
      User.count({ where: { is_anonymous: true } }),
      User.findAll({
        attributes: ['status', [fn('COUNT', col('id')), 'total']],
        where: { is_anonymous: false },
        group: ['status'],
        raw: true
      }),
      User.findAll({
        attributes: ['role', [fn('COUNT', col('id')), 'total']],
        where: { is_anonymous: false },
        group: ['role'],
        raw: true
      }),
      Analysis.count(),
      Specimen.count({ where: { is_active: true } }),
      CollectionItem.count(),
      Analysis.findAll({
        attributes: ['primary_specimen_id', [fn('COUNT', col('id')), 'recognitions']],
        where: { primary_specimen_id: { [Op.ne]: null } },
        group: ['primary_specimen_id'],
        order: [[literal('recognitions'), 'DESC'], ['primary_specimen_id', 'ASC']],
        limit: top,
        raw: true
      }),
      Feedback.findAll({
        attributes: ['rating', [fn('COUNT', col('id')), 'total']],
        group: ['rating'],
        raw: true
      }),
      Achievement.count(),
      Achievement.count({ where: { is_active: true } }),
      UserAchievement.count({ where: { is_unlocked: true } })
    ]);

    const specimens = await Specimen.findAll({
      where: { id: ranking.map((row) => row.primary_specimen_id) },
      attributes: ['id', 'name_es', 'name_en', 'category'],
      paranoid: false
    });
    const specimenById = new Map(specimens.map((specimen) => [specimen.id, specimen]));

    const statusCounts = countsToMap(usersByStatus, 'status');
    const ratingCounts = countsToMap(feedbackByRating, 'rating');
    const correct = ratingCounts[FEEDBACK_RATINGS.CORRECT] || 0;
    const incorrect = ratingCounts[FEEDBACK_RATINGS.INCORRECT] || 0;
    const uncertain = ratingCounts[FEEDBACK_RATINGS.UNCERTAIN] || 0;
    const judged = correct + incorrect;

    return {
      total_registered_users: registeredUsers,
      active_registered_users: statusCounts.active || 0,
      suspended_users: statusCounts.suspended || 0,
      banned_users: statusCounts.banned || 0,
      guest_sessions: guestSessions,
      users_by_role: countsToMap(usersByRole, 'role'),
      total_recognitions: totalRecognitions,
      most_recognized_rocks: ranking.map((row) => {
        const specimen = specimenById.get(row.primary_specimen_id);
        const recognitions = Number(row.recognitions);
        return {
          specimen_id: row.primary_specimen_id,
          name_es: specimen ? specimen.name_es : null,
          name_en: specimen ? specimen.name_en : null,
          category: specimen ? specimen.category : null,
          recognitions,
          percentage: percentage(recognitions, totalRecognitions, 1)
        };
      }),
      catalog_size: catalogSize,
      total_discoveries: totalDiscoveries,
      feedback: {
        total: correct + incorrect + uncertain,
        correct,
        incorrect,
        uncertain,
        // Share of "correct" among the evaluations that took a side.
        accuracy_rate: judged > 0 ? percentage(correct, judged, 1) : null
      },
      achievements: {
        defined: achievementsDefined,
        active: achievementsActive,
        unlocked_total: achievementsUnlocked
      }
    };
  }
}

module.exports = StatsService;
