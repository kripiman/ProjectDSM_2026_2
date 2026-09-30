const path = require('path');
const fs = require('fs');
const { Sequelize } = require('sequelize');
const env = require('./env');

const isTest = env.NODE_ENV === 'test' || process.env.NODE_ENV === 'test';
const storagePath = path.resolve(
  process.cwd(),
  isTest && (!process.env.DATABASE_STORAGE || process.env.DATABASE_STORAGE === './rock.sqlite')
    ? './rock.test.sqlite'
    : env.DATABASE_STORAGE
);
const dbDir = path.dirname(storagePath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: storagePath,
  logging: isTest ? false : (msg) => console.log(`[Sequelize] ${msg}`),
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
    if (!isTest) {
      console.log(`[Database] SQLite connected successfully at: ${storagePath}`);
    }
  } catch (error) {
    console.error('[Database] SQLite connection failure:', error.message);
    throw error;
  }
};

module.exports = {
  sequelize,
  connectDB
};
