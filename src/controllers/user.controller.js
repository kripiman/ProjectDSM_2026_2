const { UserPreference, CollectionItem, Specimen } = require('../models');
const GuestQuotaService = require('../services/guest_quota.service');
const { successResponse } = require('../utils/response_formatter');
const { serializeUser } = require('../utils/serializers');

const getProfile = async (req, res, next) => {
  try {
    const user = req.user;
    // Only rocks that are still part of the catalog count, like in the progress figures.
    const collectionCount = await CollectionItem.count({
      where: { user_id: user.id },
      include: [{ model: Specimen, as: 'specimen', required: true, attributes: [], where: { is_active: true } }]
    });

    return successResponse(res, {
      ...serializeUser(user),
      collection_count: collectionCount,
      guest_quota: user.is_anonymous ? await GuestQuotaService.usage(user.id) : null,
      createdAt: user.createdAt
    }, 'User profile retrieved successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * Updates the personal details of the authenticated user. Only whitelisted fields
 * reach this handler (see `updateProfileSchema`): role, status and the like cannot
 * be changed from here.
 */
const updateProfile = async (req, res, next) => {
  try {
    const user = req.user;
    await user.update(req.body);

    return successResponse(res, serializeUser(user), 'User profile updated successfully');
  } catch (error) {
    next(error);
  }
};

const getPreferences = async (req, res, next) => {
  try {
    const userId = req.user.id;
    let preferences = await UserPreference.findByPk(userId);

    if (!preferences) {
      preferences = await UserPreference.create({
        user_id: userId,
        language: 'es',
        theme: 'system'
      });
    }

    return successResponse(res, preferences, 'User preferences retrieved successfully');
  } catch (error) {
    next(error);
  }
};

const updatePreferences = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { language, theme, reduce_animations, push_notifications } = req.body;

    let preferences = await UserPreference.findByPk(userId);
    if (!preferences) {
      preferences = await UserPreference.create({ user_id: userId });
    }

    if (language !== undefined) preferences.language = language;
    if (theme !== undefined) preferences.theme = theme;
    if (reduce_animations !== undefined) preferences.reduce_animations = reduce_animations;
    if (push_notifications !== undefined) preferences.push_notifications = push_notifications;

    await preferences.save();

    return successResponse(res, preferences, 'User preferences updated successfully');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getProfile,
  updateProfile,
  getPreferences,
  updatePreferences
};
