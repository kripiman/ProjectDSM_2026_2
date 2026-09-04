const { connectDB, sequelize } = require('../config/database');
const models = require('../models');
const { seedData } = require('./seeders');

const initDatabase = async (force = false) => {
  try {
    await connectDB();
    await sequelize.sync({ force });
    console.log('[Database] Tables synchronized with SQLite successfully.');
    await seedData();
    console.log('[Database] Database initialization completed successfully.');
  } catch (error) {
    console.error('[Database] Initialization error:', error);
    throw error;
  }
};

if (require.main === module) {
  initDatabase(false).then(() => {
    process.exit(0);
  }).catch(() => {
    process.exit(1);
  });
}

module.exports = {
  initDatabase
};
