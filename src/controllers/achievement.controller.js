const { fn, col } = require('sequelize');
const { Achievement, UserAchievement } = require('../models');
const AchievementService = require('../services/gamification/achievement.service');
const { successResponse } = require('../utils/response_formatter');
const { AppError } = require('../utils/app_error');
const { ERROR_CODES } = require('../config/constants');

/**
 * Achievements of the authenticated user (registered or guest): the unlocked ones
 * and those still locked, with the progress made. `?status=unlocked|locked` filters.
 */
const listAchievements = async (req, res, next) => {
  try {
    const { status } = req.validatedQuery;
    const achievements = await AchievementService.listForUser(req.user.id);

    const filtered = achievements.filter((achievement) => {
      if (status === 'unlocked') return achievement.is_unlocked;
      if (status === 'locked') return !achievement.is_unlocked;
      return true;
    });

    return successResponse(res, filtered, 'Achievements list retrieved successfully');
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// Administration
// ---------------------------------------------------------------------------

const findAchievementOrFail = async (id) => {
  const achievement = await Achievement.findByPk(id);
  if (!achievement) {
    throw new AppError(404, `Achievement with ID '${id}' not found`, ERROR_CODES.NOT_FOUND);
  }
  return achievement;
};

const timesUnlockedById = async () => {
  const rows = await UserAchievement.findAll({
    attributes: ['achievement_id', [fn('COUNT', col('id')), 'total']],
    where: { is_unlocked: true },
    group: ['achievement_id'],
    raw: true
  });
  return new Map(rows.map((row) => [row.achievement_id, Number(row.total)]));
};

/** Every achievement, active or not, with how many users have unlocked it. */
const adminListAchievements = async (req, res, next) => {
  try {
    const [achievements, unlocked] = await Promise.all([
      Achievement.findAll({ order: [['xp_reward', 'ASC'], ['code', 'ASC']] }),
      timesUnlockedById()
    ]);

    return successResponse(
      res,
      achievements.map((achievement) => ({
        ...achievement.toJSON(),
        times_unlocked: unlocked.get(achievement.id) || 0
      })),
      'Achievements retrieved successfully'
    );
  } catch (error) {
    next(error);
  }
};

const adminGetAchievement = async (req, res, next) => {
  try {
    const achievement = await findAchievementOrFail(req.params.id);
    const unlocked = await UserAchievement.count({
      where: { achievement_id: achievement.id, is_unlocked: true }
    });

    return successResponse(
      res,
      { ...achievement.toJSON(), times_unlocked: unlocked },
      'Achievement retrieved successfully'
    );
  } catch (error) {
    next(error);
  }
};

const adminCreateAchievement = async (req, res, next) => {
  try {
    const data = req.body;

    const existing = await Achievement.findOne({ where: { code: data.code } });
    if (existing) {
      throw new AppError(409, `An achievement with code '${data.code}' already exists`, ERROR_CODES.CONFLICT);
    }

    const conditionValue = await AchievementService.normalizeRule(data);
    const achievement = await Achievement.create({
      ...data,
      id: data.code.toLowerCase(),
      condition_value: conditionValue
    });

    return successResponse(res, achievement, 'Achievement created successfully', 201);
  } catch (error) {
    next(error);
  }
};

const adminUpdateAchievement = async (req, res, next) => {
  try {
    const achievement = await findAchievementOrFail(req.params.id);
    const changes = { ...req.body };

    // The rule is checked as a whole, so changing only the type (or only the value)
    // cannot leave an inconsistent combination behind.
    const ruleTouched = 'condition_type' in changes || 'condition_value' in changes;
    if (ruleTouched) {
      changes.condition_value = await AchievementService.normalizeRule({
        condition_type: changes.condition_type ?? achievement.condition_type,
        condition_value: 'condition_value' in changes ? changes.condition_value : achievement.condition_value
      });
    }

    await achievement.update(changes);

    return successResponse(res, achievement, 'Achievement updated successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * "Deleting" an achievement deactivates it: it stops being granted, but the record
 * of who unlocked it (and when) is kept.
 */
const adminDeactivateAchievement = async (req, res, next) => {
  try {
    const achievement = await findAchievementOrFail(req.params.id);
    await achievement.update({ is_active: false });

    return successResponse(res, achievement, 'Achievement deactivated successfully');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  listAchievements,
  adminListAchievements,
  adminGetAchievement,
  adminCreateAchievement,
  adminUpdateAchievement,
  adminDeactivateAchievement
};
