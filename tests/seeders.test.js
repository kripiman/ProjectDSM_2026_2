const request = require('supertest');
const env = require('../src/config/env');
const logger = require('../src/utils/logger');
const { seedData } = require('../src/database/seeders');
const { QUIZ_QUESTION_SEEDS } = require('../src/database/seed_data/quiz');
const {
  User, UserPreference, Role, Category, Type, Specimen, Achievement, Quiz, QuizQuestion
} = require('../src/models');
const { createApp, auth, registerUser, uniqueEmail } = require('./helpers');

const app = createApp();

const withAdminEnv = async (variables, callback) => {
  const saved = { ADMIN_EMAIL: env.ADMIN_EMAIL, ADMIN_PASSWORD: env.ADMIN_PASSWORD, ADMIN_NAME: env.ADMIN_NAME };
  Object.assign(env, variables);
  try {
    await callback();
  } finally {
    Object.assign(env, saved);
  }
};

describe('Reference data', () => {
  test('roles are seeded with stable ids', async () => {
    const roles = await Role.findAll({ order: [['id', 'ASC']] });
    expect(roles.map((role) => [role.id, role.name])).toEqual([[1, 'guest'], [2, 'user'], [3, 'admin']]);
  });

  test('rock types and categories are seeded', async () => {
    const categories = await Category.findAll({ order: [['id', 'ASC']] });
    expect(categories.map((c) => c.name)).toEqual(['mineral', 'igneous_rock', 'sedimentary_rock', 'metamorphic_rock']);

    const types = await Type.findAll({ order: [['id', 'ASC']] });
    expect(types.map((t) => t.name)).toEqual(['silicato', 'oxido', 'sulfuro', 'carbonato']);
  });

  test('the catalog is seeded and every specimen belongs to a category and a type', async () => {
    const specimens = await Specimen.findAll();
    expect(specimens).toHaveLength(12);
    specimens.forEach((specimen) => {
      expect(specimen.category_id).not.toBeNull();
      expect(specimen.type_id).not.toBeNull();
    });

    const pyrite = await Specimen.findByPk('pyrite');
    expect([pyrite.category, pyrite.type_id]).toEqual(['mineral', 3]);
    const marble = await Specimen.findByPk('marble');
    expect([marble.category, marble.type_id]).toEqual(['metamorphic_rock', 4]);
  });

  test('achievements come with the rule that unlocks each of them', async () => {
    const achievements = await Achievement.findAll();
    expect(achievements.length).toBeGreaterThanOrEqual(3); // the assignment asks for at least three automatic ones
    achievements.forEach((achievement) => {
      expect(achievement.condition_type).toBeTruthy();
      expect(achievement.required_count).toBeGreaterThanOrEqual(1);
    });

    const byCode = Object.fromEntries(achievements.map((a) => [a.code, a]));
    expect(byCode.MINERAL_EXPERT).toMatchObject({ condition_type: 'CATEGORY_SPECIMENS', condition_value: '1', required_count: 5 });
    expect(byCode.QUIZ_CHAMPION).toMatchObject({ condition_type: 'QUIZ_SCORE', condition_value: '60' });
    expect(await Quiz.count()).toBeGreaterThanOrEqual(1);
  });

  test('seeding again changes nothing', async () => {
    const counts = async () => [
      await Role.count(), await Category.count(), await Type.count(), await Specimen.count(),
      await Achievement.count(), await Quiz.count(), await User.count({ paranoid: false })
    ];
    const before = await counts();
    await seedData();
    await seedData();
    expect(await counts()).toEqual(before);
  });

  test('records edited by an administrator are not overwritten by the seeders', async () => {
    await Achievement.update({ title: 'Título editado', xp_reward: 999 }, { where: { code: 'FIRST_SCAN' } });
    await Specimen.update({ description: 'Descripción editada' }, { where: { id: 'quartz' } });
    await Category.update({ description: 'Descripción editada' }, { where: { id: 1 } });

    await seedData();

    expect(await Achievement.findOne({ where: { code: 'FIRST_SCAN' } })).toMatchObject({ title: 'Título editado', xp_reward: 999 });
    expect((await Specimen.findByPk('quartz')).description).toBe('Descripción editada');
    expect((await Category.findByPk(1)).description).toBe('Descripción editada');
  });

  test('specimens seeded before the taxonomy existed are linked when seeding runs again', async () => {
    await Specimen.update({ category_id: null, type_id: null }, { where: { id: ['quartz', 'slate'] } });
    expect(await Specimen.count({ where: { type_id: null } })).toBe(2);

    await seedData();

    const quartz = await Specimen.findByPk('quartz');
    expect([quartz.category_id, quartz.type_id, quartz.category]).toEqual([1, 1, 'mineral']);
    const slate = await Specimen.findByPk('slate');
    expect([slate.category_id, slate.type_id, slate.category]).toEqual([4, 1, 'metamorphic_rock']);
  });

  test('seeding survives seeded rows that were soft-deleted by an administrator', async () => {
    await Type.destroy({ where: { id: 2 } }); // "oxido", deleted
    await expect(seedData()).resolves.not.toThrow();

    expect(await Type.findByPk(2)).toBeNull(); // not resurrected
    expect(await Type.count({ where: { name: 'oxido' }, paranoid: false })).toBe(1);
    await Type.restore({ where: { id: 2 } });
  });
});

describe('Quiz seed', () => {
  afterEach(async () => {
    jest.restoreAllMocks();
    await seedData(); // leaves the quiz in place for whatever runs next
  });

  const removeQuiz = async () => {
    await QuizQuestion.destroy({ where: {}, force: true });
    await Quiz.destroy({ where: {}, force: true });
  };

  test('is stored whole: a failure while saving the questions leaves no quiz without questions behind', async () => {
    await removeQuiz();
    jest.spyOn(QuizQuestion, 'bulkCreate').mockRejectedValueOnce(new Error('disk full'));

    await expect(seedData()).rejects.toThrow('disk full');
    expect(await Quiz.count({ paranoid: false })).toBe(0);
    expect(await QuizQuestion.count()).toBe(0);

    // The next run starts again from nothing instead of finding a half-seeded quiz.
    await seedData();
    expect(await Quiz.count()).toBe(1);
    expect(await QuizQuestion.count()).toBe(QUIZ_QUESTION_SEEDS.length);
  });

  test('is not repeated once a quiz exists, even if an administrator deleted its questions', async () => {
    await QuizQuestion.destroy({ where: {}, force: true });
    await seedData();

    expect(await Quiz.count()).toBe(1);
    expect(await QuizQuestion.count()).toBe(0);
    await removeQuiz(); // the afterEach seeds it again
  });
});

describe('Administrator account', () => {
  test('is created from ADMIN_EMAIL and ADMIN_PASSWORD, with a hashed password', async () => {
    const email = uniqueEmail('seeded_admin');
    await withAdminEnv({ ADMIN_EMAIL: email, ADMIN_PASSWORD: 'SeededPass123', ADMIN_NAME: 'Jefe de Pruebas' }, async () => {
      await seedData();
    });

    const admin = await User.scope('withPassword').findOne({ where: { email } });
    expect(admin).toMatchObject({
      role: 'admin', role_id: 3, status: 'active', is_anonymous: false, display_name: 'Jefe de Pruebas'
    });
    expect(admin.password_hash).toMatch(/^\$2[aby]\$/);
    expect(admin.password_hash).not.toContain('SeededPass123');
    expect(await UserPreference.findByPk(admin.id)).not.toBeNull();

    // It can log in and use the administration area.
    const login = await request(app).post('/auth/login').send({ email, password: 'SeededPass123' }).expect(200);
    expect(login.body.data.user.role).toBe('admin');
    await request(app).get('/admin/stats').set(auth(login.body.data.token)).expect(200);
  });

  test('is created only once, however many times the seeders run', async () => {
    const email = uniqueEmail('once');
    await withAdminEnv({ ADMIN_EMAIL: email, ADMIN_PASSWORD: 'SeededPass123' }, async () => {
      await seedData();
      await seedData();
      await seedData();
    });
    expect(await User.count({ where: { email }, paranoid: false })).toBe(1);
  });

  test('nothing is created without credentials, and there are no built-in ones', async () => {
    const before = await User.count({ where: { role: 'admin' }, paranoid: false });

    await withAdminEnv({ ADMIN_EMAIL: '', ADMIN_PASSWORD: '' }, () => seedData());
    await withAdminEnv({ ADMIN_EMAIL: uniqueEmail('nopass'), ADMIN_PASSWORD: '' }, () => seedData());
    await withAdminEnv({ ADMIN_EMAIL: '', ADMIN_PASSWORD: 'SeededPass123' }, () => seedData());

    expect(await User.count({ where: { role: 'admin' }, paranoid: false })).toBe(before);
  });

  test('a weak password is refused', async () => {
    const email = uniqueEmail('weak');
    await withAdminEnv({ ADMIN_EMAIL: email, ADMIN_PASSWORD: 'short' }, () => seedData());
    expect(await User.count({ where: { email }, paranoid: false })).toBe(0);
  });

  test('an existing ordinary account with that email is never promoted, and the seeders say so', async () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => {});
    const existing = await registerUser(app);
    await withAdminEnv({ ADMIN_EMAIL: existing.email, ADMIN_PASSWORD: 'SeededPass123' }, () => seedData());

    const stored = await User.findByPk(existing.user.id);
    expect(stored.role).toBe('user');
    await request(app).get('/admin/stats').set(auth(existing.token)).expect(403);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(`${existing.email} belongs to a non-administrator account`));
    warn.mockRestore();
  });

  test('a deleted administrator account is not recreated behind anyone\'s back, and the seeders say so', async () => {
    const email = uniqueEmail('deleted_admin');
    await withAdminEnv({ ADMIN_EMAIL: email, ADMIN_PASSWORD: 'SeededPass123' }, () => seedData());
    await (await User.findOne({ where: { email } })).destroy();

    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => {});
    await withAdminEnv({ ADMIN_EMAIL: email, ADMIN_PASSWORD: 'SeededPass123' }, () => seedData());

    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/was deleted and is not recreated automatically.*db:reset/));
    warn.mockRestore();
    expect(await User.count({ where: { email } })).toBe(0);
    expect(await User.count({ where: { email }, paranoid: false })).toBe(1);
  });

  test('missing or weak credentials are reported instead of failing silently', async () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => {});

    await withAdminEnv({ ADMIN_EMAIL: '', ADMIN_PASSWORD: '' }, () => seedData());
    expect(warn).toHaveBeenLastCalledWith(expect.stringMatching(/ADMIN_EMAIL \/ ADMIN_PASSWORD are not set/));

    await withAdminEnv({ ADMIN_EMAIL: uniqueEmail('weak_report'), ADMIN_PASSWORD: 'short' }, () => seedData());
    expect(warn).toHaveBeenLastCalledWith(expect.stringMatching(/at least 8 characters/));
    warn.mockRestore();
  });

  test('the administrator cannot be created through the public registration', async () => {
    const email = uniqueEmail('wannabe');
    const res = await request(app)
      .post('/auth/register')
      .send({ email, password: 'Password123!', role: 'admin' })
      .expect(201);
    expect(res.body.data.user.role).toBe('user');
  });
});
