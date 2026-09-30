const { initDatabase } = require('../src/database/init');

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  await initDatabase(false);
});
