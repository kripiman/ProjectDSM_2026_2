const { AppError } = require('../utils/app_error');
const { ERROR_CODES } = require('../config/constants');

// Express 5 exposes `req.query` as a read-only getter that re-parses the URL on every
// access, so parsed query data cannot be written back. Every source therefore stores
// its validated (and type-coerced) result under a dedicated property.
const VALIDATED_PROPERTY = {
  body: 'validatedBody',
  query: 'validatedQuery',
  params: 'validatedParams'
};

const formatIssue = (issue) => {
  const field = Array.isArray(issue.path) ? issue.path.join('.') : '';
  return field ? `${field}: ${issue.message}` : issue.message;
};

/**
 * Express middleware to validate request payload against a Zod schema.
 * Supports validating 'body', 'query', or 'params'.
 * The parsed and normalized data is exposed as `req.validatedBody`,
 * `req.validatedQuery` or `req.validatedParams`; for 'body' it also replaces `req.body`.
 *
 * @param {import('zod').ZodSchema} schema
 * @param {'body'|'query'|'params'} [source='body']
 * @returns {import('express').RequestHandler}
 */
const validate = (schema, source = 'body') => (req, res, next) => {
  try {
    const parsed = schema.parse(req[source]);
    req[VALIDATED_PROPERTY[source]] = parsed;
    if (source === 'body') {
      req.body = parsed;
    }
    next();
  } catch (error) {
    if (error.name === 'ZodError') {
      const formattedMessage = error.issues && error.issues.length > 0
        ? error.issues.map(formatIssue).join(', ')
        : 'Validation failed';
      return next(new AppError(400, formattedMessage, ERROR_CODES.VALIDATION_ERROR, error.issues));
    }
    next(error);
  }
};

module.exports = {
  validate
};
