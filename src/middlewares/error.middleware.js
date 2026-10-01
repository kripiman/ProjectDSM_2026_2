const { errorResponse } = require('../utils/response_formatter');
const { AppError } = require('../utils/app_error');
const logger = require('../utils/logger');
const { ERROR_CODES, MAX_UPLOAD_BYTES } = require('../config/constants');
const { removeUploadedFiles } = require('../utils/uploads');

const INTERNAL_ERROR_MESSAGE = 'Internal server error';

const errorHandler = async (err, req, res, next) => {
  const reportedStatus = Number(err.statusCode || err.status);
  let statusCode = Number.isInteger(reportedStatus) && reportedStatus >= 400 && reportedStatus < 600 ? reportedStatus : 500;
  let message = err.message || INTERNAL_ERROR_MESSAGE;
  let errorCode = err.errorCode || ERROR_CODES.INTERNAL_ERROR;
  let details = err.details || null;

  // Messages are only shown to clients when they were written for them: our own
  // AppError instances and client errors raised by middleware such as the body parser.
  // Everything else (database failures, programming errors, ...) gets a generic message.
  let exposeMessage = err instanceof AppError || (err.expose === true && statusCode < 500);

  if (err.name === 'MulterError') {
    exposeMessage = true;
    if (err.code === 'LIMIT_FILE_SIZE') {
      statusCode = 413;
      message = `Uploaded file exceeds the maximum allowed size of ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB`;
    } else {
      statusCode = 400;
      message = `File upload error: ${err.message}`;
    }
    errorCode = ERROR_CODES.VALIDATION_ERROR;
  } else if (err.type === 'entity.parse.failed') {
    exposeMessage = true;
    statusCode = 400;
    errorCode = ERROR_CODES.VALIDATION_ERROR;
    message = 'Request body contains malformed JSON';
  } else if (err.name === 'SequelizeValidationError') {
    exposeMessage = true;
    statusCode = 400;
    errorCode = ERROR_CODES.VALIDATION_ERROR;
    message = err.errors.map((e) => e.message).join(', ');
  } else if (err.name === 'SequelizeUniqueConstraintError') {
    exposeMessage = true;
    statusCode = 409;
    errorCode = ERROR_CODES.CONFLICT;
    message = err.errors.map((e) => e.message).join(', ');
  } else if (err.name === 'SequelizeForeignKeyConstraintError') {
    exposeMessage = true;
    statusCode = 409;
    errorCode = ERROR_CODES.CONFLICT;
    message = 'The operation conflicts with related records (invalid reference or record still in use)';
  }

  if (statusCode >= 500) {
    logger.error('[Error Handler]', err);
    exposeMessage = false;
    errorCode = ERROR_CODES.INTERNAL_ERROR;
    details = null;
  }

  if (!exposeMessage) {
    message = statusCode >= 500 ? INTERNAL_ERROR_MESSAGE : (message || INTERNAL_ERROR_MESSAGE);
  }

  // A rejected request must not leave its uploaded image behind. It is removed before the
  // answer goes out, so whoever sees the error can rely on the file being gone.
  await removeUploadedFiles(req);

  return errorResponse(res, message, statusCode, errorCode, details);
};

module.exports = {
  errorHandler
};
