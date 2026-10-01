const { verifyToken } = require('./token.service');
const UserService = require('./user.service');
const { User } = require('../models');
const { AppError } = require('../utils/app_error');
const { ERROR_CODES } = require('../config/constants');

class SessionService {
  /**
   * Resolves the account behind a bearer token. The token is only a claim: the user,
   * their current role and their status always come from the database.
   *
   * Rejects tokens that are expired or forged, that were superseded (the session
   * version changed, e.g. a guest session that has been converted into an account)
   * and tokens of accounts that are not active.
   *
   * @param {string} token
   * @param {{ transaction?: import('sequelize').Transaction }} [options] Read the user inside a transaction.
   * @throws {AppError} 401 or 403
   */
  static async resolveUser(token, { transaction } = {}) {
    let decoded;
    try {
      decoded = verifyToken(token);
    } catch (err) {
      throw new AppError(401, 'Invalid or expired authentication token', ERROR_CODES.UNAUTHORIZED);
    }

    const user = await User.findByPk(decoded.userId, { transaction });
    if (!user) {
      throw new AppError(401, 'User associated with token no longer exists', ERROR_CODES.UNAUTHORIZED);
    }

    // Tokens issued before sessions were versioned carry no version: they belong to version 1.
    const tokenVersion = decoded.tokenVersion ?? 1;
    const guestSessionConsumed = decoded.isAnonymous === true && !user.is_anonymous;
    if (tokenVersion !== user.token_version || guestSessionConsumed) {
      throw new AppError(401, 'This session is no longer valid. Please sign in again.', ERROR_CODES.UNAUTHORIZED);
    }

    UserService.assertActive(user);
    return user;
  }
}

module.exports = SessionService;
