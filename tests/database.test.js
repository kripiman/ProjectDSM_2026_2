const path = require('path');
const { spawnSync } = require('child_process');
const sqlite3 = require('sqlite3');
const { sequelize } = require('../src/models');
const { initDatabase, seedOnly, findMissingColumns } = require('../src/database/init');
const { SPECIMEN_SEEDS } = require('../src/database/seed_data/specimens');

describe('Database initialization', () => {
  test('an up-to-date database initializes without changes and can be seeded again', async () => {
    expect(await findMissingColumns()).toEqual([]);
    await expect(initDatabase(false)).resolves.toBeUndefined();
    await expect(seedOnly()).resolves.toBeUndefined();
  });

  test('a database created by an older version is reported with the steps to fix it', async () => {
    // Simulate the schema of a previous version.
    await sequelize.query('ALTER TABLE `user` DROP COLUMN `status`');
    await sequelize.query('ALTER TABLE `user` DROP COLUMN `token_version`');
    await sequelize.query('ALTER TABLE `achievement` DROP COLUMN `condition_type`');

    expect(await findMissingColumns()).toEqual(
      expect.arrayContaining(['user.status', 'user.token_version', 'achievement.condition_type'])
    );

    for (const run of [() => initDatabase(false), () => seedOnly()]) {
      await expect(run()).rejects.toThrow(/schema is out of date \(missing: .*user\.status.*\)/);
      await expect(run()).rejects.toThrow(/npm run db:migrate.*npm run db:reset/);
    }

    // Rebuilding from scratch repairs it.
    await expect(initDatabase(true)).resolves.toBeUndefined();
    expect(await findMissingColumns()).toEqual([]);
  });
});

describe('Rebuilding the database from the command line (npm run db:reset)', () => {
  const ROOT = path.resolve(__dirname, '..');
  const file = path.join(process.env.TEST_TMP_ROOT, 'command_line.sqlite');
  const seededDescription = SPECIMEN_SEEDS.find((specimen) => specimen.id === 'quartz').description;

  // Runs the real script in its own process, against a database of its own.
  const run = (args, environment) => spawnSync(process.execPath, ['src/database/init.js', ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 60000,
    env: { ...process.env, DATABASE_STORAGE: file, JWT_SECRET: 'x'.repeat(40), LOG_SQL: 'false', ...environment }
  });

  const query = (sql) => new Promise((resolve, reject) => {
    const connection = new sqlite3.Database(file, (openError) => {
      if (openError) return reject(openError);
      return connection.all(sql, (error, rows) => connection.close(() => (error ? reject(error) : resolve(rows))));
    });
  });

  const quartzDescription = async () => (await query("SELECT description FROM specimen WHERE id = 'quartz'"))[0].description;
  const editByHand = () => query("UPDATE specimen SET description = 'edited by hand' WHERE id = 'quartz'");

  beforeAll(async () => {
    const created = run([], { NODE_ENV: 'production' });
    expect(created.status).toBe(0);
    expect(await quartzDescription()).toBe(seededDescription);
  });

  test('with NODE_ENV=production it refuses to delete the data unless --yes is given', async () => {
    await editByHand();

    const refused = run(['--force'], { NODE_ENV: 'production' });

    expect(refused.status).toBe(1);
    expect(refused.stderr).toMatch(/Refusing to rebuild the database with NODE_ENV=production without --yes/);
    expect(await quartzDescription()).toBe('edited by hand');
  });

  test('with --yes the rebuild goes ahead and the data is replaced by the seeded one', async () => {
    await editByHand();

    const rebuilt = run(['--force', '--yes'], { NODE_ENV: 'production' });

    expect(rebuilt.status).toBe(0);
    expect(await quartzDescription()).toBe(seededDescription);
  });

  test('outside production --force needs no confirmation', async () => {
    await editByHand();

    const rebuilt = run(['--force'], { NODE_ENV: 'development' });

    expect(rebuilt.status).toBe(0);
    expect(await quartzDescription()).toBe(seededDescription);
  });

  test('without --force the data is kept, even in production', async () => {
    await editByHand();

    expect(run([], { NODE_ENV: 'production' }).status).toBe(0);
    expect(await quartzDescription()).toBe('edited by hand');
  });
});
