const { Achievement, UserAchievement } = require('../models');
const { successResponse } = require('../utils/response_formatter');

const listAchievements = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const achievements = await Achievement.findAll({
      where: { is_active: true },
      order: [['xp_reward', 'ASC']]
    });

    const userProgress = await UserAchievement.findAll({
      where: { user_id: userId }
    });

    const progressMap = new Map(userProgress.map(p => [p.achievement_id, p]));

    const result = achievements.map(ach => {
      const prog = progressMap.get(ach.id);
      return {
        id: ach.id,
        code: ach.code,
        title: ach.title,
        description: ach.description,
        category: ach.category,
        icon_url: ach.icon_url,
        required_count: ach.required_count,
        xp_reward: ach.xp_reward,
        current_progress: prog ? prog.current_progress : 0,
        is_unlocked: prog ? prog.is_unlocked : false,
        unlocked_at: prog ? prog.unlocked_at : null
      };
    });

    return successResponse(res, result, 'Achievements list retrieved successfully');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  listAchievements
};
