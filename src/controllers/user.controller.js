const { User, UserPreference, CollectionItem } = require('../models');
const { successResponse } = require('../utils/response_formatter');
const { AppError } = require('../middlewares/error.middleware');

const getProfile = async (req, res, next) => {
  try {
    const user = req.user;
    const collectionCount = await CollectionItem.count({ where: { user_id: user.id } });

    return successResponse(res, {
      id: user.id,
      email: user.email,
      display_name: user.display_name,
      avatar_url: user.avatar_url,
      is_anonymous: user.is_anonymous,
      role: user.role,
      current_level: user.current_level,
      experience_points: user.experience_points,
      collection_count: collectionCount,
      created_at: user.created_at
    }, 'User profile retrieved successfully');
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
    if (reduce_animations !== undefined) preferences.reduce_animations = Boolean(reduce_animations);
    if (push_notifications !== undefined) preferences.push_notifications = Boolean(push_notifications);

    await preferences.save();

    return successResponse(res, preferences, 'User preferences updated successfully');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getProfile,
  getPreferences,
  updatePreferences
};
