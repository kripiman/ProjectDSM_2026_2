const { Op } = require('sequelize');
const {
  User, Analysis, CollectionItem, Specimen, Feedback
} = require('../models');
const CatalogService = require('../services/catalog.service');
const StatsService = require('../services/stats.service');
const UserService = require('../services/user.service');
const AchievementService = require('../services/gamification/achievement.service');
const { successResponse } = require('../utils/response_formatter');
const { serializeUser } = require('../utils/serializers');
const { buildPagination, toPageWindow } = require('../utils/pagination');

// Fields of a user that are safe to show in administrative listings.
const USER_SUMMARY_ATTRIBUTES = ['id', 'email', 'userName', 'display_name', 'is_anonymous', 'role', 'status'];

const presentUser = (user) => ({
  ...serializeUser(user),
  createdAt: user.createdAt,
  updatedAt: user.updatedAt
});

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

const listUsers = async (req, res, next) => {
  try {
    const { role, status, is_anonymous: anonymity, q } = req.validatedQuery;
    const window = toPageWindow(req.validatedQuery);

    const where = {};
    if (role) where.role = role;
    if (status) where.status = status;
    if (anonymity !== 'all') where.is_anonymous = anonymity === 'true';
    if (q) {
      const pattern = `%${q}%`;
      where[Op.or] = [
        { email: { [Op.like]: pattern } },
        { userName: { [Op.like]: pattern } },
        { display_name: { [Op.like]: pattern } }
      ];
    }

    const { count, rows } = await User.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: window.limit,
      offset: window.offset
    });

    return successResponse(res, {
      users: rows.map(presentUser),
      pagination: buildPagination(window, count)
    }, 'Users retrieved successfully');
  } catch (error) {
    next(error);
  }
};

const collectionOf = (userId) => CollectionItem.findAll({
  where: { user_id: userId },
  include: [{ model: Specimen, as: 'specimen', include: CatalogService.relations() }],
  order: [['discovered_at', 'DESC']]
});

/**
 * Everything the administrator needs to know about one user: profile, progress,
 * collection and achievements.
 */
const getUser = async (req, res, next) => {
  try {
    const user = await UserService.findOrFail(req.params.id);

    const [progress, collection, achievements] = await Promise.all([
      StatsService.getUserProgress(user),
      collectionOf(user.id),
      AchievementService.listForUser(user.id)
    ]);

    return successResponse(res, {
      user: presentUser(user),
      progress,
      collection,
      achievements: {
        unlocked: achievements.filter((achievement) => achievement.is_unlocked),
        locked: achievements.filter((achievement) => !achievement.is_unlocked)
      }
    }, 'User details retrieved successfully');
  } catch (error) {
    next(error);
  }
};

const getUserCollection = async (req, res, next) => {
  try {
    const user = await UserService.findOrFail(req.params.id);
    const collection = await collectionOf(user.id);

    return successResponse(res, {
      user: presentUser(user),
      total_discovered: collection.length,
      collection
    }, 'User collection retrieved successfully');
  } catch (error) {
    next(error);
  }
};

const getUserAchievements = async (req, res, next) => {
  try {
    const user = await UserService.findOrFail(req.params.id);
    const achievements = await AchievementService.listForUser(user.id);

    return successResponse(res, {
      user: presentUser(user),
      unlocked: achievements.filter((achievement) => achievement.is_unlocked),
      locked: achievements.filter((achievement) => !achievement.is_unlocked)
    }, 'User achievements retrieved successfully');
  } catch (error) {
    next(error);
  }
};

const changeUserRole = async (req, res, next) => {
  try {
    const user = await UserService.changeRole(req.params.id, req.body.role);
    return successResponse(res, presentUser(user), 'User role updated successfully');
  } catch (error) {
    next(error);
  }
};

const changeUserStatus = async (req, res, next) => {
  try {
    const user = await UserService.changeStatus(req.params.id, req.body.status);
    return successResponse(res, presentUser(user), 'User status updated successfully');
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// Platform supervision
// ---------------------------------------------------------------------------

const getStats = async (req, res, next) => {
  try {
    const stats = await StatsService.getGlobalStats({ top: req.validatedQuery.top });
    return successResponse(res, stats, 'Platform statistics retrieved successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * Recognition history of the whole platform, newest first.
 */
const getHistory = async (req, res, next) => {
  try {
    const { user_id: userId, specimen_id: specimenId, status, from, to } = req.validatedQuery;
    const window = toPageWindow(req.validatedQuery);

    const where = {};
    if (userId) where.user_id = userId;
    if (specimenId) where.primary_specimen_id = specimenId;
    if (status) where.status = status;
    if (from || to) {
      where.createdAt = {
        ...(from && { [Op.gte]: from }),
        ...(to && { [Op.lte]: to })
      };
    }

    const { count, rows } = await Analysis.findAndCountAll({
      where,
      attributes: { exclude: ['raw_ai_response', 'extracted_features'] },
      include: [
        { model: User, as: 'user', attributes: USER_SUMMARY_ATTRIBUTES },
        { model: Specimen, as: 'primary_specimen', attributes: ['id', 'name_es', 'name_en', 'category'] }
      ],
      order: [['createdAt', 'DESC']],
      limit: window.limit,
      offset: window.offset
    });

    return successResponse(res, {
      recognitions: rows,
      pagination: buildPagination(window, count)
    }, 'Recognition history retrieved successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * Every evaluation users have sent about the recognition results.
 */
const listFeedback = async (req, res, next) => {
  try {
    const { rating, user_id: userId } = req.validatedQuery;
    const window = toPageWindow(req.validatedQuery);

    const where = {};
    if (rating) where.rating = rating;
    if (userId) where.user_id = userId;

    const { count, rows } = await Feedback.findAndCountAll({
      where,
      include: [
        { model: User, as: 'user', attributes: USER_SUMMARY_ATTRIBUTES },
        {
          model: Analysis,
          as: 'analysis',
          attributes: ['id', 'image_url', 'ai_confidence', 'provider_used', 'createdAt'],
          include: [{ model: Specimen, as: 'primary_specimen', attributes: ['id', 'name_es', 'name_en'] }]
        },
        { model: Specimen, as: 'suggested_specimen', attributes: ['id', 'name_es', 'name_en'] }
      ],
      order: [['createdAt', 'DESC']],
      limit: window.limit,
      offset: window.offset
    });

    return successResponse(res, {
      feedback: rows,
      pagination: buildPagination(window, count)
    }, 'Feedback retrieved successfully');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  listUsers,
  getUser,
  getUserCollection,
  getUserAchievements,
  changeUserRole,
  changeUserStatus,
  getStats,
  getHistory,
  listFeedback
};
