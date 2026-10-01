const { AppError } = require('../utils/app_error');
const { ERROR_CODES } = require('../config/constants');

const MAX_DEPTH = 8;

const hasNullByte = (value, depth = 0) => {
  if (typeof value === 'string') {
    return value.includes('\u0000');
  }
  if (value === null || typeof value !== 'object' || depth > MAX_DEPTH) {
    return false;
  }
  return Object.keys(value).some((key) => key.includes('\u0000') || hasNullByte(value[key], depth + 1));
};

const decode = (text) => {
  try {
    return decodeURIComponent(text);
  } catch (err) {
    return text;
  }
};

/**
 * Rejects requests that carry NUL characters in the URL or in the body. SQLite cannot
 * store them inside text parameters, so they would otherwise end as server errors.
 * Place it after the body parsers (and after Multer on routes that accept forms).
 */
const rejectNullBytes = (req, res, next) => {
  if (decode(req.originalUrl).includes('\u0000') || hasNullByte(req.body)) {
    return next(new AppError(400, 'Request contains invalid characters', ERROR_CODES.VALIDATION_ERROR));
  }
  return next();
};

module.exports = {
  rejectNullBytes
};
