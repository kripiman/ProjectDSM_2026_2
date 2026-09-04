const { errorResponse } = require('../utils/response_formatter');
const { ERROR_CODES } = require('../config/constants');

class AppError extends Error {
  constructor(statusCode, message, errorCode = null, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error';
  let errorCode = err.errorCode || ERROR_CODES.INTERNAL_ERROR;
  let details = err.details || null;

  if (err.name === 'MulterError') {
    statusCode = 400;
    errorCode = ERROR_CODES.VALIDATION_ERROR;
    message = `File upload error: ${err.message}`;
  } else if (err.name === 'ZodError') {
    statusCode = 400;
    errorCode = ERROR_CODES.VALIDATION_ERROR;
    message = 'Validation failed';
    details = err.errors || err.issues;
  } else if (err.name === 'SequelizeValidationError' || err.name === 'SequelizeUniqueConstraintError') {
    statusCode = 400;
    errorCode = ERROR_CODES.VALIDATION_ERROR;
    message = err.errors.map(e => e.message).join(', ');
  }

  if (process.env.NODE_ENV !== 'test' && statusCode >= 500) {
    console.error('[Error Handler]', err);
  }

  return errorResponse(res, message, statusCode, errorCode, details);
};

module.exports = {
  AppError,
  errorHandler
};
