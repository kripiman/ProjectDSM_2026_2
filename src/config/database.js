const path = require('path');
const fs = require('fs');
const { Sequelize } = require('sequelize');
const env = require('./env');

const storagePath = path.resolve(process.cwd(), env.DATABASE_STORAGE);
const dbDir = path.dirname(storagePath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: storagePath,
  logging: env.NODE_ENV === 'test' ? false : (msg) => console.log(`[Sequelize] ${msg}`),
  define: {
    timestamps: true,
    underscored: true,
    freezeTableName: true // Enforces exact singular lowercase table names
  }
});

const connectDB = async () => {
  try {
    await sequelize.authenticate();
    // Enforce SQLite Foreign Keys
    await sequelize.query('PRAGMA foreign_keys = ON;');
    await sequelize.query('PRAGMA journal_mode = WAL;');
    console.log(`[Database] SQLite connected successfully at: ${storagePath}`);
  } catch (error) {
    console.error('[Database] SQLite connection failure:', error.message);
    throw error;
  }
};

module.exports = {
  sequelize,
  connectDB
};
