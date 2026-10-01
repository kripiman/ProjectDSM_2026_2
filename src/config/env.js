require('dotenv').config({ quiet: true });

const crypto = require('crypto');
const { EXAMPLE_JWT_SECRET, EXAMPLE_ADMIN_PASSWORD } = require('./example_values');

const NODE_ENV = process.env.NODE_ENV || 'development';
const isTest = NODE_ENV === 'test';
const isProduction = NODE_ENV === 'production';
const isDevelopment = NODE_ENV === 'development';

const MIN_PRODUCTION_SECRET_LENGTH = 32;

/**
 * The signing secret is never hard-coded: outside production a missing value is
 * replaced by a random, process-local secret (tokens simply stop being valid after
 * a restart), while production refuses to boot without a strong, non-example one.
 */
const resolveJwtSecret = () => {
  const configured = process.env.JWT_SECRET;

  if (isProduction) {
    if (!configured || configured.length < MIN_PRODUCTION_SECRET_LENGTH) {
      throw new Error(
        `JWT_SECRET must be defined with at least ${MIN_PRODUCTION_SECRET_LENGTH} characters when NODE_ENV=production`
      );
    }
    if (configured === EXAMPLE_JWT_SECRET) {
      throw new Error('JWT_SECRET still has the example value from .env.example; define a real secret when NODE_ENV=production');
    }
    return configured;
  }

  if (configured) {
    return configured;
  }

  if (!isTest) {
    console.warn('[Config] JWT_SECRET is not set. Using a random secret for this process; issued tokens will not survive a restart.');
  }
  return crypto.randomBytes(32).toString('hex');
};

/**
 * jsonwebtoken reads a bare number in a string ("3600") as milliseconds, which would
 * make tokens expire almost immediately. Plain digits are taken as seconds instead.
 */
const resolveJwtExpiry = (value) => {
  const configured = (value || '30d').trim();
  return /^\d+$/.test(configured) ? Number(configured) : configured;
};

if (isProduction && process.env.ADMIN_PASSWORD === EXAMPLE_ADMIN_PASSWORD) {
  throw new Error('ADMIN_PASSWORD still has the example value from .env.example; define a real password when NODE_ENV=production');
}

const env = {
  PORT: parseInt(process.env.PORT, 10) || 8080,
  NODE_ENV,
  isTest,
  isProduction,
  DATABASE_STORAGE: process.env.DATABASE_STORAGE || (isTest ? './rock.test.sqlite' : './rock.sqlite'),
  // SQL statements are printed only while developing, unless LOG_SQL says otherwise.
  LOG_SQL: process.env.LOG_SQL ? process.env.LOG_SQL === 'true' : isDevelopment,
  JWT_SECRET: resolveJwtSecret(),
  JWT_EXPIRES_IN: resolveJwtExpiry(process.env.JWT_EXPIRES_IN),
  BCRYPT_ROUNDS: parseInt(process.env.BCRYPT_ROUNDS, 10) || (isTest ? 4 : 10),
  ADMIN_EMAIL: (process.env.ADMIN_EMAIL || '').trim().toLowerCase(),
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || '',
  ADMIN_NAME: process.env.ADMIN_NAME || 'Administrator',
  GEODEX_API_URL: (process.env.GEODEX_API_URL || 'https://geodex-ml-api-76365064073.southamerica-west1.run.app').replace(/\/+$/, ''),
  GEODEX_API_KEY: process.env.GEODEX_API_KEY || '',
  GEODEX_TIMEOUT_MS: parseInt(process.env.GEODEX_TIMEOUT_MS, 10) || 30000,
  ML_SERVER_URL: process.env.ML_SERVER_URL || '',
  ML_TIMEOUT_MS: parseInt(process.env.ML_TIMEOUT_MS, 10) || 4000,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  OPENAI_MODEL: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  UPLOAD_DIR: process.env.UPLOAD_DIR || 'uploads/analyses',
  SPECIMEN_UPLOAD_DIR: process.env.SPECIMEN_UPLOAD_DIR || 'uploads/specimens'
};

module.exports = env;
