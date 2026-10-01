/**
 * Error with an HTTP status that is safe to show to the client. The error handler
 * turns it into the JSON error envelope.
 */
class AppError extends Error {
  /**
   * @param {number} statusCode HTTP status of the response.
   * @param {string} message Message returned to the client.
   * @param {string|null} [errorCode] Stable identifier the client can branch on.
   * @param {*} [details] Extra structured information for the client.
   */
  constructor(statusCode, message, errorCode = null, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = {
  AppError
};
