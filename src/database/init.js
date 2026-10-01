const env = require('../config/env');
const logger = require('../utils/logger');
const { connectDB, sequelize } = require('../config/database');
require('../models');
const { seedData } = require('./seeders');

/**
 * Lists the columns the models expect that the database does not have (for example
 * a database created by an older version of the application). Tables that do not
 * exist yet are ignored: `sync()` creates them complete.
 * @returns {Promise<string[]>} Entries formatted as `table.column`.
 */
const findMissingColumns = async () => {
  const queryInterface = sequelize.getQueryInterface();
  const existingTables = new Set(await queryInterface.showAllTables());
  const missing = [];

  for (const model of Object.values(sequelize.models)) {
    const table = model.getTableName();
    if (!existingTables.has(table)) {
      continue;
    }

    const existingColumns = await queryInterface.describeTable(table);
    const expected = new Set(
      Object.values(model.rawAttributes)
        .filter((attribute) => attribute.type.key !== 'VIRTUAL')
        .map((attribute) => attribute.field)
    );
    expected.forEach((column) => {
      if (!existingColumns[column]) missing.push(`${table}.${column}`);
    });
  }

  return missing;
};

/**
 * `sync()` only creates tables that do not exist: it never alters existing ones.
 * Fail with an actionable message instead of a cryptic SQL error later on.
 */
const assertSchemaUpToDate = async () => {
  const missing = await findMissingColumns();
  if (missing.length > 0) {
    throw new Error(
      `The database schema is out of date (missing: ${missing.join(', ')}). ` +
      'Run "npm run db:migrate" to upgrade it, or "npm run db:reset" to rebuild it from scratch (this deletes all data).'
    );
  }
};

/**
 * Prepares the database: creates missing tables and loads the reference data.
 * @param {boolean} [force=false] Drops every table first (destructive).
 */
const initDatabase = async (force = false) => {
  await connectDB();
  if (!force) {
    // Checked before `sync`, which would otherwise try to add new constraints
    // (unique indexes) to tables that still have the old layout.
    await assertSchemaUpToDate();
  }
  await sequelize.sync({ force });
  await seedData();
  logger.info(`[Database] Database ready${force ? ' (schema rebuilt from scratch)' : ''}.`);
};

/**
 * Loads the reference data only. Expects the schema to exist already
 * (for instance after `npm run db:migrate`).
 */
const seedOnly = async () => {
  await connectDB();
  await assertSchemaUpToDate();
  await seedData();
  logger.info('[Database] Reference data loaded.');
};

if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes('--force') && env.isProduction && !args.includes('--yes')) {
    console.error('[Database] Refusing to rebuild the database with NODE_ENV=production without --yes (this deletes all data).');
    process.exit(1);
  }

  const task = args.includes('--seed') ? seedOnly() : initDatabase(args.includes('--force'));

  task.then(() => {
    process.exit(0);
  }).catch((error) => {
    console.error(`[Database] ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  initDatabase,
  seedOnly,
  findMissingColumns
};
