const { Analysis } = require('../models');
const { AppError } = require('../utils/app_error');
const { ERROR_CODES, GUEST_RECOGNITION_LIMIT } = require('../config/constants');

/**
 * Enforces the recognition limit of temporary (guest) sessions. The limit applies to
 * the session, not to the person: it is counted over the recognitions stored for
 * the guest account.
 */
class GuestQuotaService {
  static async usage(userId, { transaction } = {}) {
    const used = await Analysis.count({ where: { user_id: userId }, transaction });
    return {
      limit: GUEST_RECOGNITION_LIMIT,
      used,
      remaining: Math.max(0, GUEST_RECOGNITION_LIMIT - used)
    };
  }

  /**
   * @throws {AppError} GUEST_LIMIT_REACHED (403) once the session has no recognitions left.
   */
  static async assertWithinLimit(userId, { transaction } = {}) {
    const usage = await GuestQuotaService.usage(userId, { transaction });
    if (usage.remaining <= 0) {
      throw new AppError(
        403,
        'Guest recognition limit reached. Create an account to keep identifying rocks.',
        ERROR_CODES.GUEST_LIMIT_REACHED,
        { ...usage, registration_required: true }
      );
    }
    return usage;
  }
}

module.exports = GuestQuotaService;
