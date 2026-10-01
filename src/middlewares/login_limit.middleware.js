const crypto = require('crypto');
const env = require('../config/env');
const { ERROR_CODES } = require('../config/constants');
const { AppError } = require('../utils/app_error');
const { AttemptLimiter } = require('../utils/attempt_limiter');

const loginAttempts = new AttemptLimiter({
  maxAttempts: env.LOGIN_MAX_ATTEMPTS,
  lockMs: env.LOGIN_LOCK_MINUTES * 60 * 1000
});

// The email comes from the client and could be arbitrarily long: only a short digest of
// the pair is kept in memory.
const attemptKey = (req) => crypto
  .createHash('sha256')
  .update(`${req.ip || 'unknown'}|${req.body.email}`)
  .digest('base64url');

/**
 * Allows LOGIN_MAX_ATTEMPTS failed logins per client address and email; after that,
 * every attempt is refused with 429 (even with the right password) for
 * LOGIN_LOCK_MINUTES.
 *
 * Must run after validate(loginSchema): the email it leaves in req.body is already
 * trimmed and lowercased, so every spelling of an address shares one counter, and
 * malformed requests never reach it.
 *
 * The attempt is reserved before the password is checked, so simultaneous requests
 * cannot exceed the limit. It is forgotten when the login succeeds and given back
 * when it ends in anything but a wrong credential (an account that is not active, a
 * server error). An email that does not exist is counted like one that does.
 */
const limitLoginAttempts = (req, res, next) => {
  const key = attemptKey(req);
  const attempt = loginAttempts.consume(key);

  if (!attempt.allowed) {
    const retryAfterSeconds = Math.ceil(attempt.retryAfterMs / 1000);
    res.set('Retry-After', String(retryAfterSeconds));
    return next(new AppError(
      429,
      `Too many failed login attempts. Try again in ${Math.ceil(retryAfterSeconds / 60)} minute(s).`,
      ERROR_CODES.TOO_MANY_LOGIN_ATTEMPTS,
      { max_attempts: env.LOGIN_MAX_ATTEMPTS, retry_after_seconds: retryAfterSeconds }
    ));
  }

  res.on('finish', () => {
    if (res.statusCode === 200) {
      loginAttempts.clear(key);
    } else if (res.statusCode !== 401) {
      loginAttempts.refund(key);
    }
  });

  return next();
};

module.exports = {
  limitLoginAttempts,
  loginAttempts
};
