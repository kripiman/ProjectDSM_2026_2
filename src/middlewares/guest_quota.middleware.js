const GuestQuotaService = require('../services/guest_quota.service');

/**
 * Stops guest sessions that already used all their recognitions before the image is
 * even received, so nothing is written to disk. Must run after `requireAuth`.
 * The authoritative check runs again inside the transaction that stores the analysis.
 */
const checkGuestQuota = async (req, res, next) => {
  try {
    if (req.user && req.user.is_anonymous) {
      await GuestQuotaService.assertWithinLimit(req.user.id);
    }
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  checkGuestQuota
};
