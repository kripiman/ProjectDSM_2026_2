const { Op } = require('sequelize');
const { uuidv4 } = require('../../utils/uuid');
const {
  Achievement, UserAchievement, Analysis, CollectionItem, Specimen, UserQuizAttempt, Category
} = require('../../models');
const ExperienceService = require('./experience.service');
const { AppError } = require('../../utils/app_error');
const {
  ACHIEVEMENT_CONDITIONS: CONDITION,
  ACHIEVEMENT_TRIGGERS: TRIGGER,
  ANALYSIS_STATUS,
  REFINEMENT_STATUS,
  QUIZ_PASSING_SCORE,
  ERROR_CODES
} = require('../../config/constants');

// Which kinds of achievement can change after each domain event.
const CONDITIONS_BY_TRIGGER = {
  [TRIGGER.ANALYSIS]: [
    CONDITION.FIRST_SCAN,
    CONDITION.TOTAL_SCANS,
    CONDITION.UNIQUE_SPECIMENS,
    CONDITION.CATEGORY_SPECIMENS
  ],
  [TRIGGER.REFINEMENT]: [CONDITION.REFINEMENTS],
  [TRIGGER.QUIZ]: [CONDITION.QUIZ_SCORE]
};

const countRecognitions = (userId, transaction) => Analysis.count({
  where: { user_id: userId, status: ANALYSIS_STATUS.COMPLETED },
  transaction
});

// Each calculator measures how far a user is from an achievement of that type.
const METRICS = {
  [CONDITION.FIRST_SCAN]: (userId, achievement, transaction) => countRecognitions(userId, transaction),
  [CONDITION.TOTAL_SCANS]: (userId, achievement, transaction) => countRecognitions(userId, transaction),

  [CONDITION.UNIQUE_SPECIMENS]: (userId, achievement, transaction) => CollectionItem.count({
    where: { user_id: userId },
    transaction
  }),

  // `condition_value` holds the id of the category to be completed.
  [CONDITION.CATEGORY_SPECIMENS]: async (userId, achievement, transaction) => {
    const categoryId = Number.parseInt(achievement.condition_value, 10);
    if (!Number.isInteger(categoryId)) {
      return 0;
    }
    return CollectionItem.count({
      where: { user_id: userId },
      include: [{
        model: Specimen,
        as: 'specimen',
        required: true,
        attributes: [],
        where: { category_id: categoryId }
      }],
      transaction
    });
  },

  [CONDITION.REFINEMENTS]: (userId, achievement, transaction) => Analysis.count({
    where: { user_id: userId, refinement_status: REFINEMENT_STATUS.REFINED },
    transaction
  }),

  // `condition_value` holds the minimum score (percentage) a quiz attempt must reach.
  // Every quiz counts once, however many times it is retaken.
  [CONDITION.QUIZ_SCORE]: (userId, achievement, transaction) => {
    const parsed = Number.parseInt(achievement.condition_value, 10);
    const minimumScore = Number.isInteger(parsed) ? parsed : QUIZ_PASSING_SCORE;
    return UserQuizAttempt.count({
      where: { user_id: userId, score: { [Op.gte]: minimumScore } },
      distinct: true,
      col: 'quiz_id',
      transaction
    });
  }
};

class AchievementService {
  /**
   * Checks the parameters an administrator chose for an achievement rule and returns
   * the normalized `condition_value` to store (text, or null when the type takes none).
   * @throws {AppError} 400 when the value does not make sense for the condition type.
   */
  static async normalizeRule({ condition_type: conditionType, condition_value: conditionValue }) {
    const invalid = (message) => new AppError(400, message, ERROR_CODES.VALIDATION_ERROR);
    const hasValue = conditionValue !== undefined && conditionValue !== null && conditionValue !== '';

    if (conditionType === CONDITION.CATEGORY_SPECIMENS) {
      const categoryId = Number(conditionValue);
      if (!hasValue || !Number.isInteger(categoryId) || categoryId < 1) {
        throw invalid('condition_value must be the id of a category for CATEGORY_SPECIMENS achievements');
      }
      const category = await Category.findByPk(categoryId);
      if (!category) {
        throw invalid(`Category with ID '${categoryId}' does not exist`);
      }
      return String(categoryId);
    }

    if (conditionType === CONDITION.QUIZ_SCORE) {
      if (!hasValue) {
        return null; // Defaults to the passing score.
      }
      const score = Number(conditionValue);
      if (!Number.isInteger(score) || score < 0 || score > 100) {
        throw invalid('condition_value must be a score between 0 and 100 for QUIZ_SCORE achievements');
      }
      return String(score);
    }

    return null;
  }

  /**
   * Achievements as a user sees them: every active one with their progress, plus the
   * deactivated ones they had already unlocked (their history is never hidden).
   */
  static async listForUser(userId) {
    const records = await UserAchievement.findAll({ where: { user_id: userId } });
    const recordByAchievement = new Map(records.map((record) => [record.achievement_id, record]));
    const unlockedIds = records.filter((record) => record.is_unlocked).map((record) => record.achievement_id);

    const achievements = await Achievement.findAll({
      where: { [Op.or]: [{ is_active: true }, { id: { [Op.in]: unlockedIds } }] },
      order: [['xp_reward', 'ASC'], ['code', 'ASC']]
    });

    return achievements.map((achievement) => {
      const record = recordByAchievement.get(achievement.id);
      return {
        id: achievement.id,
        code: achievement.code,
        title: achievement.title,
        description: achievement.description,
        category: achievement.category,
        icon_url: achievement.icon_url,
        condition_type: achievement.condition_type,
        condition_value: achievement.condition_value,
        required_count: achievement.required_count,
        xp_reward: achievement.xp_reward,
        is_active: achievement.is_active,
        current_progress: record ? record.current_progress : 0,
        is_unlocked: record ? record.is_unlocked : false,
        unlocked_at: record ? record.unlocked_at : null
      };
    });
  }

  /**
   * Re-evaluates the active achievements affected by `trigger` for a user: stores the
   * progress reached and unlocks those whose threshold has been met. Achievements
   * already unlocked are left untouched, so nothing is awarded twice.
   *
   * Runs inside the caller's transaction when one is given.
   *
   * @param {string} userId
   * @param {'analysis'|'refinement'|'quiz'} trigger
   * @param {{ transaction?: import('sequelize').Transaction }} [options]
   * @returns {Promise<object[]>} Achievements unlocked by this evaluation.
   */
  static async evaluate(userId, trigger, { transaction } = {}) {
    const conditionTypes = CONDITIONS_BY_TRIGGER[trigger] || [];
    if (conditionTypes.length === 0) {
      return [];
    }

    const achievements = await Achievement.findAll({
      where: { is_active: true, condition_type: { [Op.in]: conditionTypes } },
      order: [['createdAt', 'ASC']],
      transaction
    });

    const unlocked = [];

    for (const achievement of achievements) {
      const record = await UserAchievement.findOne({
        where: { user_id: userId, achievement_id: achievement.id },
        transaction
      });
      if (record && record.is_unlocked) {
        continue;
      }

      const measure = METRICS[achievement.condition_type];
      if (!measure) {
        continue;
      }

      const measured = await measure(userId, achievement, transaction);
      const reached = measured >= achievement.required_count;
      const progress = Math.min(measured, achievement.required_count);
      const unlockedAt = reached ? new Date() : null;

      if (record) {
        record.current_progress = progress;
        if (reached) {
          record.is_unlocked = true;
          record.unlocked_at = unlockedAt;
        }
        await record.save({ transaction });
      } else {
        await UserAchievement.create({
          id: uuidv4(),
          user_id: userId,
          achievement_id: achievement.id,
          current_progress: progress,
          is_unlocked: reached,
          unlocked_at: unlockedAt
        }, { transaction });
      }

      if (reached) {
        await ExperienceService.award(userId, achievement.xp_reward, { transaction });
        unlocked.push({
          id: achievement.id,
          code: achievement.code,
          title: achievement.title,
          description: achievement.description,
          icon_url: achievement.icon_url,
          xp_reward: achievement.xp_reward,
          unlocked_at: unlockedAt
        });
      }
    }

    return unlocked;
  }
}

module.exports = AchievementService;
