const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { AppError } = require('./error.middleware');
const { ERROR_CODES, USER_ROLES } = require('../config/constants');
const { User } = require('../models');

const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError(401, 'Authentication token is required', ERROR_CODES.UNAUTHORIZED);
    }

    const token = authHeader.split(' ')[1];
    let decoded;
    try {
      decoded = jwt.verify(token, env.JWT_SECRET);
    } catch (err) {
      throw new AppError(401, 'Invalid or expired authentication token', ERROR_CODES.UNAUTHORIZED);
    }

    const user = await User.findByPk(decoded.userId);
    if (!user) {
      throw new AppError(401, 'User associated with token no longer exists', ERROR_CODES.UNAUTHORIZED);
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        const decoded = jwt.verify(token, env.JWT_SECRET);
        const user = await User.findByPk(decoded.userId);
        if (user) {
          req.user = user;
        }
      } catch (err) {
        // Continue unauthenticated if token is invalid in optional mode
      }
    }
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  requireAuth,
  optionalAuth
};
