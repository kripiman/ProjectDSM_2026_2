const fs = require('fs');
const os = require('os');
const path = require('path');

// Each test file rebuilds the schema of its database from scratch, so the suite must
// never be able to reach a real one. Every file gets its own temporary database,
// upload folders and configuration, whatever the developer's environment contains,
// and no external provider can be called.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'projectdsm-test-'));

Object.assign(process.env, {
  NODE_ENV: 'test',
  TEST_TMP_ROOT: root,
  DATABASE_STORAGE: path.join(root, 'test.sqlite'),
  UPLOAD_DIR: path.join(root, 'uploads', 'analyses'),
  SPECIMEN_UPLOAD_DIR: path.join(root, 'uploads', 'specimens'),
  JWT_SECRET: 'test-only-signing-secret',
  JWT_EXPIRES_IN: '30d',
  BCRYPT_ROUNDS: '4',
  LOG_SQL: 'false',
  ADMIN_EMAIL: '',
  ADMIN_PASSWORD: '',
  GEODEX_API_KEY: '',
  ML_SERVER_URL: '',
  OPENAI_API_KEY: ''
});

if (!path.resolve(process.env.DATABASE_STORAGE).startsWith(os.tmpdir())) {
  throw new Error('The test database must live in the temporary directory');
}

const { initDatabase } = require('../src/database/init');
const { sequelize } = require('../src/models');

beforeAll(async () => {
  await initDatabase(true);
});

afterAll(async () => {
  await sequelize.close().catch(() => {});
  fs.rmSync(root, { recursive: true, force: true });
});
