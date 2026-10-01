const { User } = require('../../models');

const XP_PER_LEVEL = 100;
const DISCOVERY_XP = 25;

const levelFromExperience = (experiencePoints) => Math.floor(experiencePoints / XP_PER_LEVEL) + 1;

class ExperienceService {
  /**
   * Adds experience points to a user and recomputes their level. Callers running
   * inside a transaction must pass it so the read-modify-write stays atomic.
   * @param {string} userId
   * @param {number} amount
   * @param {{ transaction?: import('sequelize').Transaction }} [options]
   * @returns {Promise<{ experience_points: number, current_level: number } | null>}
   */
  static async award(userId, amount, { transaction } = {}) {
    if (!amount) {
      return null;
    }

    const user = await User.findByPk(userId, { transaction });
    if (!user) {
      return null;
    }

    user.experience_points += amount;
    user.current_level = levelFromExperience(user.experience_points);
    await user.save({ transaction });

    return {
      experience_points: user.experience_points,
      current_level: user.current_level
    };
  }
}

module.exports = ExperienceService;
module.exports.DISCOVERY_XP = DISCOVERY_XP;
