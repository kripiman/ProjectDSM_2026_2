require('dotenv').config();

const isTest = process.env.NODE_ENV === 'test';

const env = {
  PORT: parseInt(process.env.PORT, 10) || 8080,
  NODE_ENV: process.env.NODE_ENV || 'development',
  DATABASE_STORAGE: process.env.DATABASE_STORAGE || (isTest ? './rock.test.sqlite' : './rock.sqlite'),
  DATABASE_NAME: process.env.DATABASE_NAME || (isTest ? 'rock_test' : 'rock'),
  JWT_SECRET: process.env.JWT_SECRET || 'default_jwt_secret_dev_rock_app_2026',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '30d',
  ML_SERVER_URL: process.env.ML_SERVER_URL || 'http://localhost:5000',
  ML_TIMEOUT_MS: parseInt(process.env.ML_TIMEOUT_MS, 10) || 4000,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  OPENAI_MODEL: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  UPLOAD_DIR: process.env.UPLOAD_DIR || 'uploads/analyses'
};

module.exports = env;
