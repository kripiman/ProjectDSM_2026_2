const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const { Sequelize, QueryTypes } = require('sequelize');
const { sequelize: modelsDb } = require('../src/models');

const MIGRATIONS_DIR = path.resolve(__dirname, '../src/database/migrations');
const migrationFiles = fs.readdirSync(MIGRATIONS_DIR).filter((file) => file.endsWith('.js')).sort();
const loadMigration = (index) => require(path.join(MIGRATIONS_DIR, migrationFiles[index]));
const BASELINE = 0;
const LATEST = migrationFiles.length - 1;

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projectdsm-migrations-'));
const openDatabase = (name) => new Sequelize({ dialect: 'sqlite', storage: path.join(workDir, `${name}.sqlite`), logging: false });

afterAll(() => {
  fs.rmSync(workDir, { recursive: true, force: true });
});

// Describes tables the way SQLite reports them, so two databases can be compared.
const describeSchema = async (db) => {
  const select = (sql) => db.query(sql, { type: QueryTypes.SELECT });
  const tables = await select("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT IN ('sqlite_sequence', 'SequelizeMeta') ORDER BY name");

  const schema = {};
  for (const { name } of tables) {
    const columns = await select(`PRAGMA table_info(\`${name}\`)`);
    const foreignKeys = await select(`PRAGMA foreign_key_list(\`${name}\`)`);
    const indexes = await select(`PRAGMA index_list(\`${name}\`)`);

    const indexSummary = [];
    for (const index of indexes) {
      const info = await select(`PRAGMA index_info(\`${index.name}\`)`);
      indexSummary.push(`${index.unique ? 'unique' : 'index'}:${info.map((column) => column.name).join(',')}`);
    }

    schema[name] = {
      columns: columns
        .map((c) => `${c.name}|${String(c.type).toUpperCase().replace(/\(\d+\)/, '')}|notnull=${c.notnull}|default=${c.dflt_value}|pk=${c.pk}`)
        .sort(),
      foreignKeys: foreignKeys.map((f) => `${f.from}->${f.table}.${f.to}|delete=${f.on_delete}|update=${f.on_update}`).sort(),
      indexes: indexSummary.sort()
    };
  }
  return schema;
};

describe('Migrations', () => {
  test('migrations are named with a timestamp and start with the baseline schema', () => {
    expect(migrationFiles.length).toBeGreaterThanOrEqual(2);
    migrationFiles.forEach((file) => expect(file).toMatch(/^\d{14}-[a-z0-9-]+\.js$/));
    expect(migrationFiles[BASELINE]).toMatch(/create-initial-schema/);
  });

  test('applying them to an empty database builds exactly the schema the models define', async () => {
    const db = openDatabase('fresh');
    const queryInterface = db.getQueryInterface();

    for (let index = 0; index < migrationFiles.length; index += 1) {
      await loadMigration(index).up(queryInterface, Sequelize);
    }

    const migrated = await describeSchema(db);
    const fromModels = await describeSchema(modelsDb);
    await db.close();

    expect(Object.keys(migrated)).toEqual(Object.keys(fromModels));
    for (const table of Object.keys(fromModels)) {
      expect({ table, ...migrated[table] }).toEqual({ table, ...fromModels[table] });
    }
  });

  test('every migration can be applied twice and reverted', async () => {
    const db = openDatabase('twice');
    const queryInterface = db.getQueryInterface();

    for (let index = 0; index < migrationFiles.length; index += 1) {
      await loadMigration(index).up(queryInterface, Sequelize);
    }
    const once = await describeSchema(db);

    for (let index = 0; index < migrationFiles.length; index += 1) {
      await loadMigration(index).up(queryInterface, Sequelize);
    }
    expect(await describeSchema(db)).toEqual(once);

    // Reverting the last migration returns to the baseline schema.
    await loadMigration(LATEST).down(queryInterface, Sequelize);
    const reverted = await describeSchema(db);
    expect(reverted.user.columns.join()).not.toMatch(/token_version|\|status\|/);
    expect(reverted.achievement.columns.join()).not.toMatch(/condition_type|condition_value/);
    expect(reverted.collection_item.columns.join()).not.toMatch(/occurrences_count/);
    expect(reverted.feedback.indexes.join()).not.toMatch(/unique:analysis_id/);

    const baselineDb = openDatabase('baseline');
    await loadMigration(BASELINE).up(baselineDb.getQueryInterface(), Sequelize);
    const baseline = await describeSchema(baselineDb);
    await baselineDb.close();
    await db.close();
    expect(reverted).toEqual(baseline);
  });

  describe('upgrading a database created before them', () => {
    let db;
    const now = '2026-01-01 10:00:00.000 +00:00';

    const run = (sql, replacements = {}) => db.query(sql, { replacements });
    const rows = (sql) => db.query(sql, { type: QueryTypes.SELECT });

    beforeAll(async () => {
      db = openDatabase('legacy');
      await loadMigration(BASELINE).up(db.getQueryInterface(), Sequelize);

      // Data as the previous version of the application stored it.
      await run(`INSERT INTO role (id, name, is_deleted, created_at, updated_at) VALUES
        (1, 'guest', 0, '${now}', '${now}'), (2, 'user', 0, '${now}', '${now}'), (3, 'admin', 0, '${now}', '${now}')`);
      await run(`INSERT INTO category (id, name, is_deleted, created_at, updated_at) VALUES
        (1, 'mineral', 0, '${now}', '${now}'), (2, 'igneous_rock', 0, '${now}', '${now}')`);
      await run(`INSERT INTO user (id, email, role, is_anonymous, experience_points, current_level, is_deleted, created_at, updated_at) VALUES
        ('u-admin', 'admin@legacy.cl', 'admin', 0, 0, 1, 0, '${now}', '${now}'),
        ('u-user', 'user@legacy.cl', 'user', 0, 0, 1, 0, '${now}', '${now}'),
        ('u-guest', NULL, 'guest', 1, 0, 1, 0, '${now}', '${now}'),
        ('u-mixed', 'Maria.Gomez@Gmail.com', 'user', 0, 0, 1, 0, '${now}', '${now}'),
        ('u-twin-a', 'Twin@Legacy.cl', 'user', 0, 0, 1, 0, '${now}', '${now}'),
        ('u-twin-b', 'twin@legacy.cl', 'user', 0, 0, 1, 0, '${now}', '${now}')`);
      await run(`INSERT INTO specimen (id, name_es, name_en, category, rarity, magnetism, description, is_active, is_deleted, created_at, updated_at) VALUES
        ('quartz', 'Cuarzo', 'Quartz', 'mineral', 'common', 0, 'd', 1, 0, '${now}', '${now}'),
        ('basalt', 'Basalto', 'Basalt', 'igneous_rock', 'common', 0, 'd', 1, 0, '${now}', '${now}'),
        ('odd', 'Raro', 'Odd', 'unknown_category', 'common', 0, 'd', 1, 0, '${now}', '${now}'),
        ('stale', 'Obsidiana', 'Obsidian', 'mineral', 'common', 0, 'd', 1, 0, '${now}', '${now}')`);
      // A rock whose category was chosen by id but still carries the default name.
      await run("UPDATE specimen SET category_id = 2 WHERE id = 'stale'");
      await run(`INSERT INTO achievement (id, code, title, description, category, required_count, xp_reward, is_active, created_at, updated_at) VALUES
        ('first_scan', 'FIRST_SCAN', 't', 'd', 'discovery', 1, 50, 1, '${now}', '${now}'),
        ('novice_collector', 'NOVICE_COLLECTOR', 't', 'd', 'discovery', 3, 100, 1, '${now}', '${now}'),
        ('mineral_expert', 'MINERAL_EXPERT', 't', 'd', 'discovery', 5, 200, 1, '${now}', '${now}'),
        ('refinement_master', 'REFINEMENT_MASTER', 't', 'd', 'refinement', 1, 75, 1, '${now}', '${now}'),
        ('quiz_champion', 'QUIZ_CHAMPION', 't', 'd', 'quiz', 1, 150, 1, '${now}', '${now}'),
        ('custom', 'CUSTOM_ONE', 't', 'd', 'discovery', 2, 10, 1, '${now}', '${now}')`);
      await run(`INSERT INTO analysis (id, user_id, image_url, status, is_specimen, provider_used, refinement_status, created_at, updated_at) VALUES
        ('an-1', 'u-user', '/a.jpg', 'completed', 1, 'heuristic', 'none', '${now}', '${now}'),
        ('an-2', 'u-user', '/b.jpg', 'completed', 1, 'heuristic', 'none', '${now}', '${now}')`);
      await run(`INSERT INTO collection_item (id, user_id, specimen_id, discovered_at, is_favorite, created_at, updated_at) VALUES
        ('ci-1', 'u-user', 'quartz', '${now}', 0, '${now}', '${now}')`);
      // The same recognition evaluated three times: only the newest survives.
      await run(`INSERT INTO feedback (id, analysis_id, user_id, rating, created_at, updated_at) VALUES
        ('f-old', 'an-1', 'u-user', 'correct', '2026-01-01 10:00:00.000 +00:00', '${now}'),
        ('f-new', 'an-1', 'u-user', 'incorrect', '2026-01-03 10:00:00.000 +00:00', '${now}'),
        ('f-mid', 'an-1', 'u-user', 'uncertain', '2026-01-02 10:00:00.000 +00:00', '${now}'),
        ('f-other', 'an-2', 'u-user', 'correct', '${now}', '${now}')`);

      await loadMigration(LATEST).up(db.getQueryInterface(), Sequelize);
    });

    afterAll(() => db.close());

    test('existing accounts become active and start at session version 1', async () => {
      const users = await rows('SELECT id, status, token_version FROM user ORDER BY id');
      expect(users).toHaveLength(6);
      users.forEach((user) => expect(user).toMatchObject({ status: 'active', token_version: 1 }));
    });

    test('e-mails are lower-cased, except where that would merge two accounts', async () => {
      const emails = Object.fromEntries((await rows('SELECT id, email FROM user')).map((u) => [u.id, u.email]));
      expect(emails['u-mixed']).toBe('maria.gomez@gmail.com');
      expect(emails['u-admin']).toBe('admin@legacy.cl');
      expect(emails['u-guest']).toBeNull();
      // Two accounts that only differed by capitals keep their addresses.
      expect(emails['u-twin-a']).toBe('Twin@Legacy.cl');
      expect(emails['u-twin-b']).toBe('twin@legacy.cl');
    });

    test('role_id is filled in from the role name', async () => {
      const users = await rows('SELECT id, role, role_id FROM user ORDER BY id');
      expect(users.filter((u) => ['u-admin', 'u-guest', 'u-user'].includes(u.id)).map((u) => [u.id, u.role, u.role_id])).toEqual([
        ['u-admin', 'admin', 3], ['u-guest', 'guest', 1], ['u-user', 'user', 2]
      ]);
      users.forEach((u) => expect(u.role_id).not.toBeNull());
    });

    test('category_id is derived from the category name; unknown names stay unlinked', async () => {
      const specimens = await rows('SELECT id, category_id, type_id FROM specimen ORDER BY id');
      expect(specimens).toEqual([
        { id: 'basalt', category_id: 2, type_id: null },
        { id: 'odd', category_id: null, type_id: null },
        { id: 'quartz', category_id: 1, type_id: null },
        { id: 'stale', category_id: 2, type_id: null }
      ]);
    });

    test('the category name kept on each rock follows its category', async () => {
      const names = Object.fromEntries((await rows('SELECT id, category FROM specimen')).map((r) => [r.id, r.category]));
      expect(names.stale).toBe('igneous_rock'); // was 'mineral' while pointing at the igneous category
      expect(names.quartz).toBe('mineral');
      expect(names.odd).toBe('unknown_category'); // no category to follow
    });

    test('the columns used by the most frequent queries are indexed', async () => {
      for (const [table, column] of [['analysis', 'user_id'], ['analysis_candidate', 'analysis_id'], ['specimen', 'category_id'], ['feedback', 'user_id']]) {
        const indexes = await rows(`PRAGMA index_list(\`${table}\`)`);
        const covered = [];
        for (const index of indexes) {
          const info = await rows(`PRAGMA index_info(\`${index.name}\`)`);
          covered.push(...info.map((entry) => entry.name));
        }
        expect([table, column, covered.includes(column)]).toEqual([table, column, true]);
      }
    });

    test('collection entries start with one recognition', async () => {
      expect(await rows('SELECT id, occurrences_count FROM collection_item')).toEqual([{ id: 'ci-1', occurrences_count: 1 }]);
    });

    test('the rules that used to be in the code are stored as data', async () => {
      const rules = await rows('SELECT code, condition_type, condition_value, required_count FROM achievement ORDER BY code');
      expect(rules).toEqual([
        { code: 'CUSTOM_ONE', condition_type: 'TOTAL_SCANS', condition_value: null, required_count: 2 },
        { code: 'FIRST_SCAN', condition_type: 'FIRST_SCAN', condition_value: null, required_count: 1 },
        { code: 'MINERAL_EXPERT', condition_type: 'CATEGORY_SPECIMENS', condition_value: '1', required_count: 5 },
        { code: 'NOVICE_COLLECTOR', condition_type: 'UNIQUE_SPECIMENS', condition_value: null, required_count: 3 },
        { code: 'QUIZ_CHAMPION', condition_type: 'QUIZ_SCORE', condition_value: '60', required_count: 1 },
        { code: 'REFINEMENT_MASTER', condition_type: 'REFINEMENTS', condition_value: null, required_count: 1 }
      ]);
    });

    test('duplicated feedback is reduced to the newest evaluation before the unique index is created', async () => {
      const feedback = await rows('SELECT id, analysis_id, rating FROM feedback ORDER BY id');
      expect(feedback).toEqual([
        { id: 'f-new', analysis_id: 'an-1', rating: 'incorrect' },
        { id: 'f-other', analysis_id: 'an-2', rating: 'correct' }
      ]);

      await expect(
        run(`INSERT INTO feedback (id, analysis_id, user_id, rating, created_at, updated_at) VALUES ('dup', 'an-1', 'u-user', 'correct', '${now}', '${now}')`)
      ).rejects.toMatchObject({ name: 'SequelizeUniqueConstraintError' });
    });

    test('the result matches the current models', async () => {
      const upgraded = await describeSchema(db);
      const fromModels = await describeSchema(modelsDb);
      for (const table of Object.keys(fromModels)) {
        expect({ table, ...upgraded[table] }).toEqual({ table, ...fromModels[table] });
      }
    });
  });

  test('sequelize-cli applies, reports and reverts them', () => {
    const storage = path.join(workDir, 'cli.sqlite');
    const cli = (command) => execSync(`npx sequelize-cli ${command}`, {
      cwd: path.resolve(__dirname, '..'),
      env: { ...process.env, NODE_ENV: 'development', DATABASE_STORAGE: storage },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const migrated = cli('db:migrate');
    migrationFiles.forEach((file) => expect(migrated).toContain(`${file.replace(/\.js$/, '')}: migrated`));

    const status = cli('db:migrate:status');
    expect(status.match(/^up /gm)).toHaveLength(migrationFiles.length);
    expect(cli('db:migrate')).not.toMatch(/: migrating/); // nothing left to apply

    cli('db:migrate:undo:all');
    expect(cli('db:migrate:status').match(/^down /gm)).toHaveLength(migrationFiles.length);
  }, 60000);
});
