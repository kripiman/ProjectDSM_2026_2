const { initDatabase } = require('../src/database/init');
const { sequelize } = require('../src/config/database');

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  await initDatabase(false);
});

afterAll(async () => {
  await sequelize.close();
});
