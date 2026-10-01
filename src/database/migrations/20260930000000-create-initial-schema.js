'use strict';

/**
 * Baseline schema (v0.9.0).
 *
 * Every statement is idempotent: tables that already exist (for instance when the
 * database was originally created through `sequelize.sync()`) are left untouched,
 * so this migration can be applied safely on top of a pre-existing database.
 */

const ensureIndex = async (queryInterface, table, fields, options = {}) => {
  const existing = await queryInterface.showIndex(table);
  const name = options.name || `${table}_${fields.join('_')}`;
  const alreadyThere = existing.some((index) => {
    const columns = (index.fields || []).map((f) => f.attribute);
    return columns.length === fields.length && fields.every((f) => columns.includes(f));
  });
  if (!alreadyThere) {
    await queryInterface.addIndex(table, fields, { ...options, name });
  }
};

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('role', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: Sequelize.STRING, allowNull: false, unique: true },
      description: { type: Sequelize.STRING, allowNull: true },
      is_deleted: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      deleted_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    await queryInterface.createTable('user', {
      id: { type: Sequelize.STRING, primaryKey: true },
      role_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'role', key: 'id' }, onDelete: 'SET NULL', onUpdate: 'CASCADE' },
      user_name: { type: Sequelize.STRING, allowNull: true, unique: true },
      email: { type: Sequelize.STRING, allowNull: true, unique: true },
      password_hash: { type: Sequelize.STRING, allowNull: true },
      phone: { type: Sequelize.STRING, allowNull: true, unique: true },
      display_name: { type: Sequelize.STRING, allowNull: true },
      avatar_url: { type: Sequelize.STRING, allowNull: true },
      is_anonymous: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      role: { type: Sequelize.STRING, allowNull: false, defaultValue: 'user' },
      experience_points: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      current_level: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      is_deleted: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      deleted_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    await queryInterface.createTable('user_preference', {
      user_id: { type: Sequelize.STRING, primaryKey: true, references: { model: 'user', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
      language: { type: Sequelize.STRING, allowNull: false, defaultValue: 'es' },
      theme: { type: Sequelize.STRING, allowNull: false, defaultValue: 'system' },
      reduce_animations: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      push_notifications: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    await queryInterface.createTable('category', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: Sequelize.STRING, allowNull: false, unique: true },
      description: { type: Sequelize.TEXT, allowNull: true },
      is_deleted: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      deleted_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    await queryInterface.createTable('type', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      name: { type: Sequelize.STRING, allowNull: false, unique: true },
      description: { type: Sequelize.TEXT, allowNull: true },
      is_deleted: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      deleted_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    await queryInterface.createTable('specimen', {
      id: { type: Sequelize.STRING, primaryKey: true },
      catalog_index: { type: Sequelize.INTEGER, allowNull: true, unique: true },
      category_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'category', key: 'id' }, onDelete: 'SET NULL', onUpdate: 'CASCADE' },
      type_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'type', key: 'id' }, onDelete: 'SET NULL', onUpdate: 'CASCADE' },
      name_es: { type: Sequelize.STRING, allowNull: false },
      name_en: { type: Sequelize.STRING, allowNull: false },
      scientific_name: { type: Sequelize.STRING, allowNull: true },
      category: { type: Sequelize.STRING, allowNull: false },
      rarity: { type: Sequelize.STRING, allowNull: false, defaultValue: 'common' },
      mohs_hardness_min: { type: Sequelize.FLOAT, allowNull: true },
      mohs_hardness_max: { type: Sequelize.FLOAT, allowNull: true },
      streak_color: { type: Sequelize.STRING, allowNull: true },
      luster: { type: Sequelize.STRING, allowNull: true },
      color_description: { type: Sequelize.STRING, allowNull: true },
      texture: { type: Sequelize.STRING, allowNull: true },
      transparency: { type: Sequelize.FLOAT, allowNull: true },
      tenacity: { type: Sequelize.FLOAT, allowNull: true },
      density: { type: Sequelize.FLOAT, allowNull: true },
      crystal_system: { type: Sequelize.STRING, allowNull: true },
      cleavage: { type: Sequelize.STRING, allowNull: true },
      fracture: { type: Sequelize.STRING, allowNull: true },
      magnetism: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      specific_gravity: { type: Sequelize.FLOAT, allowNull: true },
      molar_weight: { type: Sequelize.FLOAT, allowNull: true },
      composition: { type: Sequelize.STRING, allowNull: true },
      chemical_formula: { type: Sequelize.STRING, allowNull: true },
      environment: { type: Sequelize.STRING, allowNull: true },
      common_uses: { type: Sequelize.STRING, allowNull: true },
      description: { type: Sequelize.TEXT, allowNull: false },
      identification_tips: { type: Sequelize.TEXT, allowNull: true },
      thumbnail_url: { type: Sequelize.STRING, allowNull: true },
      full_image_url: { type: Sequelize.STRING, allowNull: true },
      mindat_url: { type: Sequelize.STRING, allowNull: true },
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      is_deleted: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      deleted_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    await queryInterface.createTable('analysis', {
      id: { type: Sequelize.STRING, primaryKey: true },
      user_id: { type: Sequelize.STRING, allowNull: false, references: { model: 'user', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
      image_url: { type: Sequelize.STRING, allowNull: false },
      status: { type: Sequelize.STRING, allowNull: false, defaultValue: 'completed' },
      is_specimen: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      error_code: { type: Sequelize.STRING, allowNull: true },
      extracted_features: { type: Sequelize.JSON, allowNull: true },
      provider_used: { type: Sequelize.STRING, allowNull: false, defaultValue: 'heuristic' },
      ai_confidence: { type: Sequelize.FLOAT, allowNull: true },
      primary_specimen_id: { type: Sequelize.STRING, allowNull: true, references: { model: 'specimen', key: 'id' }, onDelete: 'SET NULL', onUpdate: 'CASCADE' },
      educational_explanation: { type: Sequelize.TEXT, allowNull: true },
      refinement_status: { type: Sequelize.STRING, allowNull: false, defaultValue: 'none' },
      raw_ai_response: { type: Sequelize.JSON, allowNull: true },
      execution_time_ms: { type: Sequelize.INTEGER, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    await queryInterface.createTable('analysis_candidate', {
      id: { type: Sequelize.STRING, primaryKey: true },
      analysis_id: { type: Sequelize.STRING, allowNull: false, references: { model: 'analysis', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
      specimen_id: { type: Sequelize.STRING, allowNull: false, references: { model: 'specimen', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
      rank: { type: Sequelize.INTEGER, allowNull: false },
      confidence_score: { type: Sequelize.FLOAT, allowNull: false },
      provider: { type: Sequelize.STRING, allowNull: false },
      rationale: { type: Sequelize.TEXT, allowNull: true },
      is_selected: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    await queryInterface.createTable('analysis_refinement', {
      id: { type: Sequelize.STRING, primaryKey: true },
      analysis_id: { type: Sequelize.STRING, allowNull: false, references: { model: 'analysis', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
      question_type: { type: Sequelize.STRING, allowNull: false },
      user_answer: { type: Sequelize.TEXT, allowNull: false },
      confidence_delta: { type: Sequelize.FLOAT, allowNull: true, defaultValue: 0 },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    await queryInterface.createTable('collection_item', {
      id: { type: Sequelize.STRING, primaryKey: true },
      user_id: { type: Sequelize.STRING, allowNull: false, references: { model: 'user', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
      specimen_id: { type: Sequelize.STRING, allowNull: false, references: { model: 'specimen', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
      analysis_id: { type: Sequelize.STRING, allowNull: true, references: { model: 'analysis', key: 'id' }, onDelete: 'SET NULL', onUpdate: 'CASCADE' },
      discovered_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      notes: { type: Sequelize.TEXT, allowNull: true },
      custom_image_url: { type: Sequelize.STRING, allowNull: true },
      is_favorite: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });
    await ensureIndex(queryInterface, 'collection_item', ['user_id', 'specimen_id'], { unique: true });

    await queryInterface.createTable('feedback', {
      id: { type: Sequelize.STRING, primaryKey: true },
      analysis_id: { type: Sequelize.STRING, allowNull: false, references: { model: 'analysis', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
      user_id: { type: Sequelize.STRING, allowNull: true, references: { model: 'user', key: 'id' }, onDelete: 'SET NULL', onUpdate: 'CASCADE' },
      rating: { type: Sequelize.STRING, allowNull: false },
      suggested_specimen_id: { type: Sequelize.STRING, allowNull: true, references: { model: 'specimen', key: 'id' }, onDelete: 'SET NULL', onUpdate: 'CASCADE' },
      comments: { type: Sequelize.TEXT, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    await queryInterface.createTable('achievement', {
      id: { type: Sequelize.STRING, primaryKey: true },
      code: { type: Sequelize.STRING, allowNull: false, unique: true },
      title: { type: Sequelize.STRING, allowNull: false },
      description: { type: Sequelize.TEXT, allowNull: false },
      category: { type: Sequelize.STRING, allowNull: false },
      icon_url: { type: Sequelize.STRING, allowNull: true },
      required_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      xp_reward: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 50 },
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    await queryInterface.createTable('user_achievement', {
      id: { type: Sequelize.STRING, primaryKey: true },
      user_id: { type: Sequelize.STRING, allowNull: false, references: { model: 'user', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
      achievement_id: { type: Sequelize.STRING, allowNull: false, references: { model: 'achievement', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
      current_progress: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      is_unlocked: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      unlocked_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });
    await ensureIndex(queryInterface, 'user_achievement', ['user_id', 'achievement_id'], { unique: true });

    await queryInterface.createTable('quiz', {
      id: { type: Sequelize.STRING, primaryKey: true },
      title: { type: Sequelize.STRING, allowNull: false },
      description: { type: Sequelize.TEXT, allowNull: true },
      category: { type: Sequelize.STRING, allowNull: false },
      difficulty: { type: Sequelize.STRING, allowNull: false, defaultValue: 'medium' },
      xp_reward: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 100 },
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    await queryInterface.createTable('quiz_question', {
      id: { type: Sequelize.STRING, primaryKey: true },
      quiz_id: { type: Sequelize.STRING, allowNull: false, references: { model: 'quiz', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
      specimen_id: { type: Sequelize.STRING, allowNull: true, references: { model: 'specimen', key: 'id' }, onDelete: 'SET NULL', onUpdate: 'CASCADE' },
      question_text: { type: Sequelize.TEXT, allowNull: false },
      explanation: { type: Sequelize.TEXT, allowNull: true },
      options: { type: Sequelize.JSON, allowNull: false },
      correct_option_index: { type: Sequelize.INTEGER, allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    await queryInterface.createTable('user_quiz_attempt', {
      id: { type: Sequelize.STRING, primaryKey: true },
      user_id: { type: Sequelize.STRING, allowNull: false, references: { model: 'user', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
      quiz_id: { type: Sequelize.STRING, allowNull: false, references: { model: 'quiz', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
      score: { type: Sequelize.INTEGER, allowNull: false },
      total_questions: { type: Sequelize.INTEGER, allowNull: false },
      xp_earned: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      passed: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      completed_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    await queryInterface.createTable('user_event', {
      id: { type: Sequelize.STRING, primaryKey: true },
      user_id: { type: Sequelize.STRING, allowNull: true, references: { model: 'user', key: 'id' }, onDelete: 'SET NULL', onUpdate: 'CASCADE' },
      event_type: { type: Sequelize.STRING, allowNull: false },
      payload: { type: Sequelize.JSON, allowNull: true },
      ip_address: { type: Sequelize.STRING, allowNull: true },
      user_agent: { type: Sequelize.STRING, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    await queryInterface.createTable('notification', {
      id: { type: Sequelize.STRING, primaryKey: true },
      user_id: { type: Sequelize.STRING, allowNull: false, references: { model: 'user', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
      title: { type: Sequelize.STRING, allowNull: false },
      message: { type: Sequelize.TEXT, allowNull: false },
      type: { type: Sequelize.STRING, allowNull: false, defaultValue: 'system' },
      is_read: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      read_at: { type: Sequelize.DATE, allowNull: true },
      action_url: { type: Sequelize.STRING, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('notification');
    await queryInterface.dropTable('user_event');
    await queryInterface.dropTable('user_quiz_attempt');
    await queryInterface.dropTable('quiz_question');
    await queryInterface.dropTable('quiz');
    await queryInterface.dropTable('user_achievement');
    await queryInterface.dropTable('achievement');
    await queryInterface.dropTable('feedback');
    await queryInterface.dropTable('collection_item');
    await queryInterface.dropTable('analysis_refinement');
    await queryInterface.dropTable('analysis_candidate');
    await queryInterface.dropTable('analysis');
    await queryInterface.dropTable('specimen');
    await queryInterface.dropTable('type');
    await queryInterface.dropTable('category');
    await queryInterface.dropTable('user_preference');
    await queryInterface.dropTable('user');
    await queryInterface.dropTable('role');
  }
};
