const bcrypt = require('bcryptjs');
const env = require('../config/env');
const logger = require('../utils/logger');
const { uuidv4 } = require('../utils/uuid');
const { USER_ROLES, USER_STATUS } = require('../config/constants');
const {
  Specimen, Achievement, Quiz, QuizQuestion, Role, Category, Type, User, UserPreference, sequelize
} = require('../models');
const { ROLE_SEEDS, CATEGORY_SEEDS, TYPE_SEEDS } = require('./seed_data/taxonomy');
const { SPECIMEN_SEEDS } = require('./seed_data/specimens');
const { ACHIEVEMENT_SEEDS } = require('./seed_data/achievements');
const { QUIZ_SEED, QUIZ_QUESTION_SEEDS } = require('./seed_data/quiz');

const MIN_ADMIN_PASSWORD_LENGTH = 8;

/**
 * Inserts the rows that are missing, looked up by primary key (soft-deleted rows
 * count as present). Existing rows are never overwritten: administrators may have
 * edited them since they were seeded.
 */
const ensureRows = async (Model, rows) => {
  for (const row of rows) {
    const existing = await Model.findByPk(row.id, { paranoid: false });
    if (!existing) {
      await Model.create(row);
    }
  }
};

const seedRoles = () => ensureRows(Role, ROLE_SEEDS);
const seedCategories = () => ensureRows(Category, CATEGORY_SEEDS);
const seedTypes = () => ensureRows(Type, TYPE_SEEDS);

const seedSpecimens = async () => {
  let created = 0;
  for (const seed of SPECIMEN_SEEDS) {
    const existing = await Specimen.findByPk(seed.id, { paranoid: false });
    if (!existing) {
      await Specimen.create(seed);
      created += 1;
    } else if (existing.category_id == null || existing.type_id == null) {
      // Databases seeded before specimens were linked to the taxonomy tables.
      await existing.update({
        category_id: existing.category_id ?? seed.category_id,
        type_id: existing.type_id ?? seed.type_id
      });
    }
  }
  if (created > 0) {
    logger.info(`[Seeders] ${created} specimen(s) seeded.`);
  }
};

const seedAchievements = async () => {
  for (const seed of ACHIEVEMENT_SEEDS) {
    const existing = await Achievement.findOne({ where: { code: seed.code } });
    if (!existing) {
      await Achievement.create(seed);
      logger.info(`[Seeders] Achievement ${seed.code} seeded.`);
    }
  }
};

const seedQuizzes = async () => {
  if ((await Quiz.count()) > 0) {
    return;
  }

  // The quiz and its questions are stored together, so a failure cannot leave a quiz
  // without questions behind (which the existence check above would then never repair).
  await sequelize.transaction(async (transaction) => {
    const quiz = await Quiz.create(QUIZ_SEED, { transaction });
    await QuizQuestion.bulkCreate(
      QUIZ_QUESTION_SEEDS.map((question) => ({ ...question, quiz_id: quiz.id })),
      { transaction }
    );
  });
  logger.info('[Seeders] Quizzes seeded successfully.');
};

/**
 * Creates the initial administrator from ADMIN_EMAIL / ADMIN_PASSWORD. Nothing is
 * created when the variables are missing: there are no built-in credentials.
 */
const seedAdministrator = async () => {
  const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME, BCRYPT_ROUNDS } = env;

  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    logger.warn('[Seeders] ADMIN_EMAIL / ADMIN_PASSWORD are not set: no administrator account was created.');
    return;
  }
  if (ADMIN_PASSWORD.length < MIN_ADMIN_PASSWORD_LENGTH) {
    logger.warn(`[Seeders] ADMIN_PASSWORD must have at least ${MIN_ADMIN_PASSWORD_LENGTH} characters: no administrator account was created.`);
    return;
  }

  const existing = await User.findOne({ where: { email: ADMIN_EMAIL }, paranoid: false });
  if (existing) {
    if (existing.deleted_at) {
      logger.warn(`[Seeders] The account of ${ADMIN_EMAIL} was deleted and is not recreated automatically: use "npm run db:reset" to start over.`);
    } else if (existing.role !== USER_ROLES.ADMIN) {
      logger.warn(`[Seeders] ${ADMIN_EMAIL} belongs to a non-administrator account and was not promoted.`);
    }
    return;
  }

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, BCRYPT_ROUNDS);
  const admin = await sequelize.transaction(async (transaction) => {
    const created = await User.create({
      id: uuidv4(),
      email: ADMIN_EMAIL,
      password_hash: passwordHash,
      display_name: ADMIN_NAME,
      is_anonymous: false,
      role: USER_ROLES.ADMIN,
      status: USER_STATUS.ACTIVE
    }, { transaction });
    await UserPreference.create({ user_id: created.id, language: 'es', theme: 'system' }, { transaction });
    return created;
  });
  logger.info(`[Seeders] Administrator account created for ${admin.email}.`);
};

const seedData = async () => {
  await seedRoles();
  await seedCategories();
  await seedTypes();
  await seedSpecimens();
  await seedAchievements();
  await seedQuizzes();
  await seedAdministrator();
};

module.exports = {
  seedData
};
