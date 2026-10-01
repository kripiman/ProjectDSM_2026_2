const jwt = require('jsonwebtoken');
const env = require('../config/env');

const ALGORITHM = 'HS256';

/**
 * Generates a signed JWT authentication token.
 * @param {string} userId
 * @param {string} role
 * @param {boolean} isAnonymous
 * @param {number} [tokenVersion] Session version stored on the user; bumping it revokes older tokens.
 * @param {object} [options] Extra `jsonwebtoken` sign options.
 * @returns {string} Signed JWT
 */
const generateToken = (userId, role, isAnonymous = false, tokenVersion = 1, options = {}) => {
  return jwt.sign(
    {
      userId,
      role,
      isAnonymous,
      tokenVersion
    },
    env.JWT_SECRET,
    {
      algorithm: ALGORITHM,
      expiresIn: isAnonymous ? '30d' : env.JWT_EXPIRES_IN,
      ...options
    }
  );
};

/**
 * Issues a token describing the current state of a user record.
 * @param {import('sequelize').Model} user
 * @returns {string}
 */
const generateTokenForUser = (user) => {
  return generateToken(user.id, user.role, user.is_anonymous, user.token_version);
};

/**
 * Verifies and decodes a JWT token.
 * @param {string} token
 * @returns {object} Decoded payload
 */
const verifyToken = (token) => {
  return jwt.verify(token, env.JWT_SECRET, { algorithms: [ALGORITHM] });
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
  generateTokenForUser,
  verifyToken,
  extractTokenFromHeader
};
