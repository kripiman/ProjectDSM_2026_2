const { AppError } = require('./error.middleware');
const { ERROR_CODES } = require('../config/constants');

/**
 * Express middleware to validate request payload against a Zod schema.
 * Supports validating 'body', 'query', or 'params'.
 * Replaces the target request property with the parsed and normalized data.
 *
 * @param {import('zod').ZodSchema} schema
 * @param {'body'|'query'|'params'} [source='body']
 * @returns {import('express').RequestHandler}
 */
const validate = (schema, source = 'body') => (req, res, next) => {
  try {
    const parsed = schema.parse(req[source]);
    req[source] = parsed;
    next();
  } catch (error) {
    if (error.name === 'ZodError') {
      const formattedMessage = error.issues && error.issues.length > 0
        ? error.issues.map((issue) => issue.message).join(', ')
        : 'Validation failed';
      return next(new AppError(400, formattedMessage, ERROR_CODES.VALIDATION_ERROR, error.issues));
    }
    next(error);
  }
};

module.exports = {
  validate
};
