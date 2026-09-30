const jwt = require('jsonwebtoken');
const env = require('../config/env');

/**
 * Generates a signed JWT authentication token.
 * @param {string} userId
 * @param {string} role
 * @param {boolean} isAnonymous
 * @param {object} [options]
 * @returns {string} Signed JWT
 */
const generateToken = (userId, role, isAnonymous = false, options = {}) => {
  return jwt.sign(
    {
      userId,
      role,
      isAnonymous
    },
    env.JWT_SECRET,
    {
      expiresIn: isAnonymous ? '30d' : (env.JWT_EXPIRES_IN || '7d'),
      ...options
    }
  );
};

/**
 * Verifies and decodes a JWT token.
 * @param {string} token
 * @returns {object} Decoded payload
 */
const verifyToken = (token) => {
  return jwt.verify(token, env.JWT_SECRET);
};

/**
 * Extracts raw Bearer token from Authorization header string.
 * @param {string|undefined} authHeader
 * @returns {string|null}
 */
const extractTokenFromHeader = (authHeader) => {
  if (!authHeader || typeof authHeader !== 'string') {
    return null;
  }
  if (!authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.split(' ')[1];
  return token && token.trim() !== '' ? token.trim() : null;
};

module.exports = {
  generateToken,
  verifyToken,
  extractTokenFromHeader
};
