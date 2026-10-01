const path = require('path');
const fs = require('fs');
const { AsyncLocalStorage } = require('async_hooks');
const { Sequelize, Transaction } = require('sequelize');
const env = require('./env');
const logger = require('../utils/logger');
const { AsyncMutex } = require('../utils/mutex');

const storagePath = path.resolve(process.cwd(), env.DATABASE_STORAGE);
const dbDir = path.dirname(storagePath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: storagePath,
  logging: env.LOG_SQL ? (msg) => console.log(`[Sequelize] ${msg}`) : false,
  // SQLite allows a single writer. Acquiring the write lock when the transaction
  // starts (instead of upgrading a read lock later) makes concurrent writers queue
  // behind the busy timeout instead of failing with SQLITE_BUSY.
  transactionType: Transaction.TYPES.IMMEDIATE,
  define: {
    timestamps: true,
    underscored: true,
    freezeTableName: true // Enforces exact singular lowercase table names
  }
});

// SQLite admits a single writer at a time, and every Sequelize transaction opens its
// own connection. When many transactions compete for the lock, each one sits in
// SQLite's native busy loop holding a libuv thread, which can leave the transaction
// that owns the lock without a thread to finish on. Queueing managed top-level
// transactions here keeps the waiting in JavaScript instead.
//
// Rules for code running inside a managed transaction callback:
//  - pass `{ transaction }` to every query, including nested `findOrCreate`;
//  - never start another `sequelize.transaction(callback)` without that parent (it
//    would wait for the turn its own caller holds, so it is rejected right away);
//  - keep network and file I/O out of the callback: it holds the turn for everyone.
// Calls that receive a parent `transaction` run directly, since the parent owns the turn.
const writeLock = new AsyncMutex();
const insideManagedTransaction = new AsyncLocalStorage();
const startTransaction = sequelize.transaction.bind(sequelize);

sequelize.transaction = function transaction(options, autoCallback) {
  const callback = typeof options === 'function' ? options : autoCallback;
  const transactionOptions = typeof options === 'function' ? undefined : options;
  const isTopLevelManaged = typeof callback === 'function' && !(transactionOptions && transactionOptions.transaction);

  if (!isTopLevelManaged) {
    return startTransaction(options, autoCallback);
  }

  if (insideManagedTransaction.getStore()) {
    return Promise.reject(new Error(
      'sequelize.transaction() was called inside another managed transaction without passing it: pass { transaction } instead'
    ));
  }

  return writeLock.runExclusive(() => startTransaction(
    transactionOptions,
    (t) => insideManagedTransaction.run(true, () => callback(t))
  ));
};

const connectDB = async () => {
  try {
    await sequelize.authenticate();
    // Enforce SQLite Foreign Keys
    await sequelize.query('PRAGMA foreign_keys = ON;');
    await sequelize.query('PRAGMA journal_mode = WAL;');
    logger.info(`[Database] SQLite connected successfully at: ${storagePath}`);
  } catch (error) {
    logger.error('[Database] SQLite connection failure:', error.message);
    throw error;
  }
};

module.exports = {
  sequelize,
  connectDB
};
