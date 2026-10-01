'use strict';

/**
 * Schema changes that came with role-based access control, guest-session quotas,
 * automatic collections and configurable achievements:
 *
 *  - user.status            account state (active / suspended / banned)
 *  - user.token_version     lets a guest session be invalidated once it is converted
 *  - collection_item.occurrences_count   times a specimen has been recognised
 *  - achievement.condition_type / condition_value   data-driven unlock rules
 *  - feedback.analysis_id unique            one evaluation per recognition
 *  - indexes on the foreign keys used by the most frequent queries
 *
 * It also brings existing data in line with the new rules (e-mails in lower case,
 * role_id and category_id filled in, the category name kept on each rock).
 *
 * Every step checks the current state first, so the migration can also be applied to
 * databases that already have some of these changes (for instance ones created by the
 * current models).
 */

const QUIZ_PASSING_SCORE = '60';

// [table, column] pairs that get a plain (non-unique) index.
const FOREIGN_KEY_INDEXES = [
  ['analysis', 'user_id'],
  ['analysis', 'primary_specimen_id'],
  ['analysis_candidate', 'analysis_id'],
  ['analysis_refinement', 'analysis_id'],
  ['specimen', 'category_id'],
  ['specimen', 'type_id'],
  ['user_quiz_attempt', 'user_id'],
  ['feedback', 'user_id']
];

const addColumnIfMissing = async (queryInterface, table, column, definition) => {
  const columns = await queryInterface.describeTable(table);
  if (!columns[column]) {
    await queryInterface.addColumn(table, column, definition);
  }
};

// Sequelize's removeColumn rebuilds the table on SQLite and drops foreign key actions
// and composite indexes while doing so. SQLite can drop a plain column directly.
const removeColumnIfPresent = async (queryInterface, table, column) => {
  const columns = await queryInterface.describeTable(table);
  if (columns[column]) {
    await queryInterface.sequelize.query(`ALTER TABLE \`${table}\` DROP COLUMN \`${column}\``);
  }
};

const findIndexOn = async (queryInterface, table, field, { unique = false } = {}) => {
  const indexes = await queryInterface.showIndex(table);
  return indexes.find((index) => {
    const columns = (index.fields || []).map((f) => f.attribute);
    return columns.length === 1 && columns[0] === field && Boolean(index.unique) === unique;
  });
};

module.exports = {
  async up(queryInterface, Sequelize) {
    const sql = (statement) => queryInterface.sequelize.query(statement);

    // --- user -----------------------------------------------------------------
    await addColumnIfMissing(queryInterface, 'user', 'status', {
      type: Sequelize.STRING, allowNull: false, defaultValue: 'active'
    });
    await addColumnIfMissing(queryInterface, 'user', 'token_version', {
      type: Sequelize.INTEGER, allowNull: false, defaultValue: 1
    });
    // `role` and `role_id` describe the same fact; accounts created before both were
    // kept in sync only have the text.
    await sql('UPDATE `user` SET role_id = (SELECT id FROM role WHERE role.name = `user`.role) WHERE role_id IS NULL');
    // E-mails are matched in lower case from now on. An address that only differs from
    // another one by its capitals is left as it is: lowering both would collide.
    await sql(`UPDATE \`user\` SET email = lower(email)
      WHERE email IS NOT NULL AND email <> lower(email)
        AND lower(email) NOT IN (
          SELECT lower(email) FROM \`user\` WHERE email IS NOT NULL GROUP BY lower(email) HAVING COUNT(*) > 1
        )`);

    // --- collection -----------------------------------------------------------
    await addColumnIfMissing(queryInterface, 'collection_item', 'occurrences_count', {
      type: Sequelize.INTEGER, allowNull: false, defaultValue: 1
    });

    // --- specimen -------------------------------------------------------------
    // `category_id` is the source of truth; older rows only had the category name.
    await sql('UPDATE specimen SET category_id = (SELECT id FROM category WHERE category.name = specimen.category) WHERE category_id IS NULL');
    // The name kept on each rock must follow its category (older rows could disagree).
    await sql(`UPDATE specimen SET category = (SELECT name FROM category WHERE category.id = specimen.category_id)
      WHERE category_id IS NOT NULL
        AND category <> (SELECT name FROM category WHERE category.id = specimen.category_id)`);

    // --- achievement ----------------------------------------------------------
    await addColumnIfMissing(queryInterface, 'achievement', 'condition_type', {
      type: Sequelize.STRING, allowNull: false, defaultValue: 'TOTAL_SCANS'
    });
    await addColumnIfMissing(queryInterface, 'achievement', 'condition_value', {
      type: Sequelize.STRING, allowNull: true
    });
    // Rules for the achievements that used to be hard-coded in the controllers.
    await sql("UPDATE achievement SET condition_type = 'FIRST_SCAN' WHERE code = 'FIRST_SCAN'");
    await sql("UPDATE achievement SET condition_type = 'UNIQUE_SPECIMENS' WHERE code = 'NOVICE_COLLECTOR'");
    await sql("UPDATE achievement SET condition_type = 'CATEGORY_SPECIMENS', condition_value = (SELECT CAST(id AS TEXT) FROM category WHERE name = 'mineral') WHERE code = 'MINERAL_EXPERT'");
    await sql("UPDATE achievement SET condition_type = 'REFINEMENTS' WHERE code = 'REFINEMENT_MASTER'");
    await sql(`UPDATE achievement SET condition_type = 'QUIZ_SCORE', condition_value = '${QUIZ_PASSING_SCORE}' WHERE code = 'QUIZ_CHAMPION'`);

    // --- feedback -------------------------------------------------------------
    if (!(await findIndexOn(queryInterface, 'feedback', 'analysis_id', { unique: true }))) {
      // Keep only the most recent evaluation of each recognition before enforcing it.
      await sql(`DELETE FROM feedback WHERE id NOT IN (
        SELECT id FROM (
          SELECT id, ROW_NUMBER() OVER (PARTITION BY analysis_id ORDER BY created_at DESC, id DESC) AS position
          FROM feedback
        ) WHERE position = 1
      )`);
      await queryInterface.addIndex('feedback', ['analysis_id'], {
        unique: true,
        name: 'feedback_analysis_id'
      });
    }

    // --- indexes ----------------------------------------------------------------
    for (const [table, column] of FOREIGN_KEY_INDEXES) {
      if (!(await findIndexOn(queryInterface, table, column))) {
        await queryInterface.addIndex(table, [column], { name: `${table}_${column}` });
      }
    }
  },

  async down(queryInterface) {
    const dropIndex = (name) => queryInterface.sequelize.query(`DROP INDEX IF EXISTS \`${name}\``);

    for (const [table, column] of FOREIGN_KEY_INDEXES) {
      await dropIndex(`${table}_${column}`);
    }
    await dropIndex('feedback_analysis_id');

    await removeColumnIfPresent(queryInterface, 'achievement', 'condition_value');
    await removeColumnIfPresent(queryInterface, 'achievement', 'condition_type');
    await removeColumnIfPresent(queryInterface, 'collection_item', 'occurrences_count');
    await removeColumnIfPresent(queryInterface, 'user', 'token_version');
    await removeColumnIfPresent(queryInterface, 'user', 'status');
  }
};
