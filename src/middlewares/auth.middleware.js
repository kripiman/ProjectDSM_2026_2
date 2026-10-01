const { extractTokenFromHeader } = require('../services/token.service');
const SessionService = require('../services/session.service');
const { AppError } = require('../utils/app_error');
const { ERROR_CODES } = require('../config/constants');

const requireAuth = async (req, res, next) => {
  try {
    const token = extractTokenFromHeader(req.headers.authorization);
    if (!token) {
      throw new AppError(401, 'Authentication token is required', ERROR_CODES.UNAUTHORIZED);
    }

    req.user = await SessionService.resolveUser(token);
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Identifies the caller when a usable token is sent and lets the request through as
 * anonymous otherwise. Only authentication problems are forgiven: a failure of the
 * database or of the server still surfaces as an error.
 */
const optionalAuth = async (req, res, next) => {
  try {
    const token = extractTokenFromHeader(req.headers.authorization);
    if (token) {
      try {
        req.user = await SessionService.resolveUser(token);
      } catch (err) {
        if (!(err instanceof AppError)) {
          throw err;
        }
      }
    }
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Restricts a route to the given roles. Must run after `requireAuth`.
 * @param {...string} allowedRoles
 * @returns {import('express').RequestHandler}
 */
const authorize = (...allowedRoles) => (req, res, next) => {
  if (!req.user) {
    return next(new AppError(401, 'Authentication token is required', ERROR_CODES.UNAUTHORIZED));
  }
  if (!allowedRoles.includes(req.user.role)) {
    return next(new AppError(403, 'You do not have permission to perform this action', ERROR_CODES.FORBIDDEN));
  }
  return next();
};

/**
 * Rejects temporary guest sessions. Must run after `requireAuth`.
 */
const requireRegistered = (req, res, next) => {
  if (!req.user) {
    return next(new AppError(401, 'Authentication token is required', ERROR_CODES.UNAUTHORIZED));
  }
  if (req.user.is_anonymous) {
    return next(new AppError(403, 'A registered account is required for this action', ERROR_CODES.FORBIDDEN));
  }
  return next();
};

module.exports = {
  requireAuth,
  optionalAuth,
  authorize,
  requireRegistered
};
