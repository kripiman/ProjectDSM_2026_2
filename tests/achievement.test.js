const request = require('supertest');
const { Op } = require('sequelize');
const { Achievement, UserAchievement, User } = require('../src/models');
const { createApp, auth, createGuest, registerUser, createAdmin, recognize } = require('./helpers');

const app = createApp();


const QUIZ_ID = 'geology_basics_101';
const SEEDED_CODES = ['FIRST_SCAN', 'NOVICE_COLLECTOR', 'MINERAL_EXPERT', 'TEN_SCANS', 'REFINEMENT_MASTER', 'QUIZ_CHAMPION'];
const CORRECT_ANSWERS = [
  { question_id: 'q1_mohs_scale', selected_option_index: 2 },
  { question_id: 'q2_fools_gold', selected_option_index: 1 },
  { question_id: 'q3_magnetism', selected_option_index: 0 }
];

const listAchievements = (token, query = '') => request(app).get(`/achievement${query}`).set(auth(token));
const codesOf = (res) => res.body.data.map((achievement) => achievement.code);
const uniqueCode = (prefix) => `${prefix}_${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`.toUpperCase();

describe('Seeded achievements unlock automatically', () => {
  let user;

  beforeAll(async () => {
    user = await registerUser(app);
  });

  test('all achievements start locked with no progress', async () => {
    const res = await listAchievements(user.token).expect(200);

    expect(res.body.data.length).toBeGreaterThanOrEqual(6);
    res.body.data.forEach((achievement) => {
      expect(achievement).toMatchObject({ is_unlocked: false, current_progress: 0, unlocked_at: null });
      expect(achievement.condition_type).toBeDefined();
    });
    expect(codesOf(res)).toEqual(expect.arrayContaining([
      'FIRST_SCAN', 'NOVICE_COLLECTOR', 'MINERAL_EXPERT', 'TEN_SCANS', 'REFINEMENT_MASTER', 'QUIZ_CHAMPION'
    ]));
  });

  test('the first recognition unlocks FIRST_SCAN, with its date and experience', async () => {
    const res = await recognize(app, user.token, 'quartz').expect(200);
    const unlocked = res.body.data.unlocked_achievements;

    expect(unlocked.map((a) => a.code)).toEqual(['FIRST_SCAN']);
    expect(unlocked[0].unlocked_at).toBeTruthy();

    const list = await listAchievements(user.token).expect(200);
    const firstScan = list.body.data.find((a) => a.code === 'FIRST_SCAN');
    expect(firstScan).toMatchObject({ is_unlocked: true, current_progress: 1, required_count: 1 });
    expect(new Date(firstScan.unlocked_at).getTime()).not.toBeNaN();

    // 25 XP for the discovery + 50 XP reward of FIRST_SCAN.
    const profile = await request(app).get('/user/profile').set(auth(user.token)).expect(200);
    expect(profile.body.data.experience_points).toBe(75);
    expect(profile.body.data.current_level).toBe(1);
  });

  test('the same achievement is never granted twice', async () => {
    const again = await recognize(app, user.token, 'quartz').expect(200);
    expect(again.body.data.unlocked_achievements).toHaveLength(0);

    const firstScan = await Achievement.findOne({ where: { code: 'FIRST_SCAN' } });
    expect(await UserAchievement.count({ where: { user_id: user.user.id, achievement_id: firstScan.id } })).toBe(1);

    const profile = await request(app).get('/user/profile').set(auth(user.token)).expect(200);
    expect(profile.body.data.experience_points).toBe(75); // no extra XP for a repeated recognition
  });

  test('NOVICE_COLLECTOR follows the number of different specimens discovered', async () => {
    await recognize(app, user.token, 'pyrite').expect(200);

    const partial = await listAchievements(user.token).expect(200);
    expect(partial.body.data.find((a) => a.code === 'NOVICE_COLLECTOR')).toMatchObject({
      is_unlocked: false, current_progress: 2, required_count: 3
    });

    const res = await recognize(app, user.token, 'basalt').expect(200);
    expect(res.body.data.unlocked_achievements.map((a) => a.code)).toEqual(['NOVICE_COLLECTOR']);

    // 75 + 25 (pyrite) + 25 (basalt) + 100 (NOVICE_COLLECTOR)
    const profile = await request(app).get('/user/profile').set(auth(user.token)).expect(200);
    expect(profile.body.data.experience_points).toBe(225);
    expect(profile.body.data.current_level).toBe(3);
  });

  test('MINERAL_EXPERT counts minerals only, using the category as its condition', async () => {
    const res = await listAchievements(user.token).expect(200);
    const expert = res.body.data.find((a) => a.code === 'MINERAL_EXPERT');

    expect(expert).toMatchObject({ condition_type: 'CATEGORY_SPECIMENS', condition_value: '1', required_count: 5 });
    // quartz and pyrite are minerals; basalt is not.
    expect(expert.current_progress).toBe(2);
    expect(expert.is_unlocked).toBe(false);
  });

  test('TEN_SCANS counts every recognition, repeated ones included', async () => {
    const before = await listAchievements(user.token).expect(200);
    const tenScans = before.body.data.find((a) => a.code === 'TEN_SCANS');
    expect(tenScans.current_progress).toBe(4);

    let unlockedAt = null;
    for (let scan = 5; scan <= 10; scan += 1) {
      const res = await recognize(app, user.token, 'quartz').expect(200);
      if (res.body.data.unlocked_achievements.some((a) => a.code === 'TEN_SCANS')) unlockedAt = scan;
    }
    expect(unlockedAt).toBe(10);
  });

  test('GET /achievement?status= separates unlocked from locked achievements', async () => {
    const unlocked = await listAchievements(user.token, '?status=unlocked').expect(200);
    const locked = await listAchievements(user.token, '?status=locked').expect(200);

    expect(codesOf(unlocked).sort()).toEqual(['FIRST_SCAN', 'NOVICE_COLLECTOR', 'TEN_SCANS']);
    expect(codesOf(locked)).toEqual(expect.arrayContaining(['MINERAL_EXPERT', 'REFINEMENT_MASTER', 'QUIZ_CHAMPION']));
    unlocked.body.data.forEach((a) => expect(a.is_unlocked).toBe(true));
    locked.body.data.forEach((a) => expect(a.is_unlocked).toBe(false));

    await listAchievements(user.token, '?status=everything').expect(400);
  });

  test('passing a quiz unlocks QUIZ_CHAMPION; failing one does not', async () => {
    const failing = CORRECT_ANSWERS.map((answer) => ({ ...answer, selected_option_index: 3 }));
    const failed = await request(app).post(`/quiz/${QUIZ_ID}/submit`).set(auth(user.token)).send({ answers: failing }).expect(200);
    expect(failed.body.data.passed).toBe(false);
    expect(failed.body.data.unlocked_achievements).toHaveLength(0);

    const passed = await request(app).post(`/quiz/${QUIZ_ID}/submit`).set(auth(user.token)).send({ answers: CORRECT_ANSWERS }).expect(200);
    expect(passed.body.data.passed).toBe(true);
    expect(passed.body.data.unlocked_achievements.map((a) => a.code)).toEqual(['QUIZ_CHAMPION']);
  });

  test('achievements require authentication', async () => {
    await request(app).get('/achievement').expect(401);
  });

  test('guest sessions see their achievements too', async () => {
    const guest = await createGuest(app);
    await recognize(app, guest.token, 'quartz').expect(200);

    const res = await listAchievements(guest.token, '?status=unlocked').expect(200);
    expect(codesOf(res)).toEqual(['FIRST_SCAN']);
  });
});

describe('Achievements administration', () => {
  let admin;

  beforeAll(async () => {
    admin = await createAdmin();
  });

  // Achievements created by one test must not be earned during the next one.
  afterEach(async () => {
    await Achievement.update({ is_active: false }, { where: { code: { [Op.notIn]: SEEDED_CODES } } });
  });

  const createAchievement = (payload) => request(app).post('/admin/achievements').set(auth(admin.token)).send(payload);

  describe('access control', () => {
    test('only administrators can manage achievements', async () => {
      const user = await registerUser(app);
      const guest = await createGuest(app);
      const payload = { code: uniqueCode('DENIED'), title: 'No autorizado', description: 'No debería crearse', condition_type: 'TOTAL_SCANS' };

      for (const token of [null, guest.token, user.token]) {
        const expected = token ? 403 : 401;
        const send = (req) => (token ? req.set(auth(token)) : req);
        expect((await send(request(app).get('/admin/achievements'))).status).toBe(expected);
        expect((await send(request(app).post('/admin/achievements')).send(payload)).status).toBe(expected);
        expect((await send(request(app).patch('/admin/achievements/first_scan')).send({ title: 'hack' })).status).toBe(expected);
        expect((await send(request(app).delete('/admin/achievements/first_scan'))).status).toBe(expected);
      }

      expect(await Achievement.findOne({ where: { code: payload.code } })).toBeNull();
      expect((await Achievement.findByPk('first_scan')).is_active).toBe(true);
    });
  });

  describe('creating, reading and updating', () => {
    test('POST /admin/achievements defines a new achievement and its unlock condition', async () => {
      const code = uniqueCode('ROCK_LOVER');
      const res = await createAchievement({
        code: code.toLowerCase(),
        title: 'Amante de las rocas',
        description: 'Completa 2 reconocimientos',
        condition_type: 'TOTAL_SCANS',
        required_count: 2,
        xp_reward: 80
      }).expect(201);

      expect(res.body.data).toMatchObject({
        code, // codes are stored upper-case
        title: 'Amante de las rocas',
        condition_type: 'TOTAL_SCANS',
        condition_value: null,
        required_count: 2,
        xp_reward: 80,
        is_active: true,
        category: 'discovery'
      });

      const read = await request(app).get(`/admin/achievements/${res.body.data.id}`).set(auth(admin.token)).expect(200);
      expect(read.body.data).toMatchObject({ code, times_unlocked: 0 });
    });

    test('codes are unique', async () => {
      const code = uniqueCode('UNIQUE');
      const payload = { code, title: 'Único', description: 'Solo uno', condition_type: 'TOTAL_SCANS' };
      await createAchievement(payload).expect(201);
      const duplicate = await createAchievement({ ...payload, code: code.toLowerCase() }).expect(409);
      expect(duplicate.body.errorCode).toBe('409_CONFLICT');
      await createAchievement({ ...payload, code: 'FIRST_SCAN' }).expect(409);
    });

    test('the definition is validated', async () => {
      const valid = { code: uniqueCode('VALID'), title: 'Válido', description: 'Descripción válida', condition_type: 'TOTAL_SCANS' };

      for (const invalid of [
        { ...valid, code: undefined },
        { ...valid, code: 'a b' },
        { ...valid, title: '' },
        { ...valid, description: undefined },
        { ...valid, condition_type: 'MAGIC' },
        { ...valid, condition_type: undefined },
        { ...valid, required_count: 0 },
        { ...valid, required_count: 1.5 },
        { ...valid, required_count: 'many' },
        { ...valid, xp_reward: -5 },
        { ...valid, is_active: 'yes' }
      ]) {
        const res = await createAchievement(invalid);
        expect(res.status).toBe(400);
      }
      await request(app).post('/admin/achievements').set(auth(admin.token)).expect(400);
    });

    test('conditions that need a parameter check it', async () => {
      const base = { title: 'Con parámetro', description: 'Depende de un parámetro' };

      // CATEGORY_SPECIMENS needs the id of an existing category.
      await createAchievement({ ...base, code: uniqueCode('CAT'), condition_type: 'CATEGORY_SPECIMENS' }).expect(400);
      await createAchievement({ ...base, code: uniqueCode('CAT'), condition_type: 'CATEGORY_SPECIMENS', condition_value: 'mineral' }).expect(400);
      const missingCategory = await createAchievement({ ...base, code: uniqueCode('CAT'), condition_type: 'CATEGORY_SPECIMENS', condition_value: 9999 }).expect(400);
      expect(missingCategory.body.message).toMatch(/does not exist/);
      const ok = await createAchievement({ ...base, code: uniqueCode('CAT'), condition_type: 'CATEGORY_SPECIMENS', condition_value: 2, required_count: 3 }).expect(201);
      expect(ok.body.data.condition_value).toBe('2');

      // QUIZ_SCORE takes an optional score between 0 and 100.
      await createAchievement({ ...base, code: uniqueCode('QZ'), condition_type: 'QUIZ_SCORE', condition_value: 150 }).expect(400);
      await createAchievement({ ...base, code: uniqueCode('QZ'), condition_type: 'QUIZ_SCORE', condition_value: 'high' }).expect(400);
      const quiz = await createAchievement({ ...base, code: uniqueCode('QZ'), condition_type: 'QUIZ_SCORE' }).expect(201);
      expect(quiz.body.data.condition_value).toBeNull();

      // Types that take no parameter ignore a stray value.
      const scans = await createAchievement({ ...base, code: uniqueCode('SC'), condition_type: 'TOTAL_SCANS', condition_value: 'whatever' }).expect(201);
      expect(scans.body.data.condition_value).toBeNull();
    });

    test('PATCH/PUT update the definition; the code cannot change', async () => {
      const created = await createAchievement({
        code: uniqueCode('EDITABLE'), title: 'Editable', description: 'Se puede editar', condition_type: 'TOTAL_SCANS', required_count: 5
      }).expect(201);
      const { id, code } = created.body.data;

      const patched = await request(app).patch(`/admin/achievements/${id}`).set(auth(admin.token)).send({ title: 'Editado', xp_reward: 10 }).expect(200);
      expect(patched.body.data).toMatchObject({ title: 'Editado', xp_reward: 10, required_count: 5 });

      const put = await request(app).put(`/admin/achievements/${id}`).set(auth(admin.token)).send({ required_count: 7, code: 'OTHER_CODE' }).expect(200);
      expect(put.body.data).toMatchObject({ required_count: 7, code });

      // Changing the rule is checked as a whole.
      await request(app).patch(`/admin/achievements/${id}`).set(auth(admin.token)).send({ condition_type: 'CATEGORY_SPECIMENS' }).expect(400);
      const retyped = await request(app).patch(`/admin/achievements/${id}`).set(auth(admin.token)).send({ condition_type: 'CATEGORY_SPECIMENS', condition_value: 1 }).expect(200);
      expect(retyped.body.data).toMatchObject({ condition_type: 'CATEGORY_SPECIMENS', condition_value: '1' });

      await request(app).patch(`/admin/achievements/${id}`).set(auth(admin.token)).send({}).expect(400);
      await request(app).patch(`/admin/achievements/${id}`).set(auth(admin.token)).send({ required_count: 0 }).expect(400);
      await request(app).patch('/admin/achievements/missing').set(auth(admin.token)).send({ title: 'Sin logro' }).expect(404);
      await request(app).get('/admin/achievements/missing').set(auth(admin.token)).expect(404);
    });

    test('GET /admin/achievements lists every achievement, inactive ones included', async () => {
      const inactive = await createAchievement({
        code: uniqueCode('SLEEPING'), title: 'Dormido', description: 'Nunca se otorga', condition_type: 'TOTAL_SCANS', is_active: false
      }).expect(201);

      const res = await request(app).get('/admin/achievements').set(auth(admin.token)).expect(200);
      const entry = res.body.data.find((a) => a.id === inactive.body.data.id);
      expect(entry).toMatchObject({ is_active: false, times_unlocked: 0 });
      expect(res.body.data.length).toBeGreaterThanOrEqual(7);
    });
  });

  describe('administrator-defined achievements are awarded by their data', () => {
    test('a TOTAL_SCANS achievement is unlocked after the required recognitions', async () => {
      const code = uniqueCode('THREE_PHOTOS');
      await createAchievement({
        code, title: 'Tres fotos', description: 'Tres reconocimientos', condition_type: 'TOTAL_SCANS', required_count: 3, xp_reward: 40
      }).expect(201);

      const user = await registerUser(app);
      const first = await recognize(app, user.token, 'quartz').expect(200);
      const second = await recognize(app, user.token, 'quartz').expect(200);
      expect(first.body.data.unlocked_achievements.map((a) => a.code)).not.toContain(code);
      expect(second.body.data.unlocked_achievements.map((a) => a.code)).not.toContain(code);

      const progress = (await listAchievements(user.token).expect(200)).body.data.find((a) => a.code === code);
      expect(progress).toMatchObject({ current_progress: 2, required_count: 3, is_unlocked: false });

      const third = await recognize(app, user.token, 'quartz').expect(200);
      expect(third.body.data.unlocked_achievements).toEqual([expect.objectContaining({ code, xp_reward: 40 })]);
    });

    test('a CATEGORY_SPECIMENS achievement counts only specimens of that category', async () => {
      const code = uniqueCode('TWO_MINERALS');
      await createAchievement({
        code, title: 'Dos minerales', description: 'Descubre dos minerales', condition_type: 'CATEGORY_SPECIMENS', condition_value: 1, required_count: 2
      }).expect(201);

      const user = await registerUser(app);
      await recognize(app, user.token, 'basalt').expect(200); // igneous rock
      const one = await recognize(app, user.token, 'quartz').expect(200);
      expect(one.body.data.unlocked_achievements.map((a) => a.code)).not.toContain(code);

      const two = await recognize(app, user.token, 'pyrite').expect(200);
      expect(two.body.data.unlocked_achievements.map((a) => a.code)).toContain(code);
    });

    test('a UNIQUE_SPECIMENS achievement ignores repeated recognitions', async () => {
      const code = uniqueCode('TWO_DIFFERENT');
      await createAchievement({
        code, title: 'Dos distintas', description: 'Dos rocas distintas', condition_type: 'UNIQUE_SPECIMENS', required_count: 2
      }).expect(201);

      const user = await registerUser(app);
      await recognize(app, user.token, 'quartz').expect(200);
      const repeated = await recognize(app, user.token, 'quartz').expect(200);
      expect(repeated.body.data.unlocked_achievements.map((a) => a.code)).not.toContain(code);

      const different = await recognize(app, user.token, 'sandstone').expect(200);
      expect(different.body.data.unlocked_achievements.map((a) => a.code)).toContain(code);
    });

    test('a QUIZ_SCORE achievement can demand a perfect score', async () => {
      const code = uniqueCode('PERFECT');
      await createAchievement({
        code, title: 'Perfecto', description: 'Quiz sin errores', condition_type: 'QUIZ_SCORE', condition_value: 100
      }).expect(201);

      const user = await registerUser(app);
      const almost = [CORRECT_ANSWERS[0], CORRECT_ANSWERS[1], { ...CORRECT_ANSWERS[2], selected_option_index: 3 }];
      const partial = await request(app).post(`/quiz/${QUIZ_ID}/submit`).set(auth(user.token)).send({ answers: almost }).expect(200);
      expect(partial.body.data.passed).toBe(true);
      expect(partial.body.data.unlocked_achievements.map((a) => a.code)).not.toContain(code);
      expect(partial.body.data.unlocked_achievements.map((a) => a.code)).toContain('QUIZ_CHAMPION');

      const perfect = await request(app).post(`/quiz/${QUIZ_ID}/submit`).set(auth(user.token)).send({ answers: CORRECT_ANSWERS }).expect(200);
      expect(perfect.body.data.unlocked_achievements.map((a) => a.code)).toEqual([code]);
    });

    test('a QUIZ_SCORE achievement counts each quiz once, however many times it is retaken', async () => {
      const code = uniqueCode('TWO_QUIZZES');
      await createAchievement({
        code, title: 'Dos cuestionarios', description: 'Aprueba dos cuestionarios distintos', condition_type: 'QUIZ_SCORE', required_count: 2
      }).expect(201);

      const user = await registerUser(app);
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const res = await request(app).post(`/quiz/${QUIZ_ID}/submit`).set(auth(user.token)).send({ answers: CORRECT_ANSWERS }).expect(200);
        expect(res.body.data.unlocked_achievements.map((a) => a.code)).not.toContain(code);
      }

      const progress = (await listAchievements(user.token).expect(200)).body.data.find((a) => a.code === code);
      expect(progress).toMatchObject({ current_progress: 1, required_count: 2, is_unlocked: false });
    });

    test('changing the threshold applies to the next evaluation', async () => {
      const code = uniqueCode('MOVING_TARGET');
      const created = await createAchievement({
        code, title: 'Objetivo móvil', description: 'Cambia de umbral', condition_type: 'TOTAL_SCANS', required_count: 50
      }).expect(201);

      const user = await registerUser(app);
      await recognize(app, user.token, 'quartz').expect(200);
      await recognize(app, user.token, 'quartz').expect(200);

      await request(app).patch(`/admin/achievements/${created.body.data.id}`).set(auth(admin.token)).send({ required_count: 3 }).expect(200);
      const res = await recognize(app, user.token, 'quartz').expect(200);
      expect(res.body.data.unlocked_achievements.map((a) => a.code)).toContain(code);
    });
  });

  describe('deactivation', () => {
    test('DELETE deactivates the achievement: nobody earns it anymore, history is preserved', async () => {
      const code = uniqueCode('RETIRED');
      const created = await createAchievement({
        code, title: 'Retirado', description: 'Se retirará', condition_type: 'TOTAL_SCANS', required_count: 1, xp_reward: 30
      }).expect(201);
      const id = created.body.data.id;

      const earlyBird = await registerUser(app);
      const res = await recognize(app, earlyBird.token, 'quartz').expect(200);
      expect(res.body.data.unlocked_achievements.map((a) => a.code)).toContain(code);

      const deleted = await request(app).delete(`/admin/achievements/${id}`).set(auth(admin.token)).expect(200);
      expect(deleted.body.data.is_active).toBe(false);

      // The record still exists, with the people who unlocked it.
      expect(await Achievement.findByPk(id)).not.toBeNull();
      expect(await UserAchievement.count({ where: { achievement_id: id, is_unlocked: true } })).toBe(1);
      const detail = await request(app).get(`/admin/achievements/${id}`).set(auth(admin.token)).expect(200);
      expect(detail.body.data.times_unlocked).toBe(1);

      // It is no longer granted to anyone...
      const latecomer = await registerUser(app);
      const late = await recognize(app, latecomer.token, 'quartz').expect(200);
      expect(late.body.data.unlocked_achievements.map((a) => a.code)).not.toContain(code);
      expect(codesOf(await listAchievements(latecomer.token).expect(200))).not.toContain(code);

      // ... but whoever unlocked it keeps seeing it.
      const history = await listAchievements(earlyBird.token, '?status=unlocked').expect(200);
      expect(history.body.data.find((a) => a.code === code)).toMatchObject({ is_active: false, is_unlocked: true });
    });

    test('an inactive achievement can be activated again', async () => {
      const created = await createAchievement({
        code: uniqueCode('COMEBACK'), title: 'Regreso', description: 'Vuelve', condition_type: 'TOTAL_SCANS', is_active: false
      }).expect(201);
      const id = created.body.data.id;

      const user = await registerUser(app);
      const before = await recognize(app, user.token, 'quartz').expect(200);
      expect(before.body.data.unlocked_achievements.map((a) => a.id)).not.toContain(id);

      await request(app).patch(`/admin/achievements/${id}`).set(auth(admin.token)).send({ is_active: true }).expect(200);
      const after = await recognize(app, user.token, 'quartz').expect(200);
      expect(after.body.data.unlocked_achievements.map((a) => a.id)).toContain(id);
    });

    test('deactivating an unknown achievement is a 404', async () => {
      await request(app).delete('/admin/achievements/missing').set(auth(admin.token)).expect(404);
    });
  });

  test('experience rewards are applied to the user exactly once', async () => {
    const code = uniqueCode('PAYDAY');
    await createAchievement({
      code, title: 'Día de pago', description: 'Da experiencia', condition_type: 'FIRST_SCAN', xp_reward: 500
    }).expect(201);

    const user = await registerUser(app);
    await recognize(app, user.token, 'quartz').expect(200);
    await recognize(app, user.token, 'quartz').expect(200);

    // Experience = 25 for the discovery + the reward of every achievement unlocked, each counted once.
    const records = await UserAchievement.findAll({
      where: { user_id: user.user.id, is_unlocked: true },
      include: [{ model: Achievement, as: 'achievement' }]
    });
    expect(records.filter((record) => record.achievement.code === code)).toHaveLength(1);
    const rewards = records.reduce((total, record) => total + record.achievement.xp_reward, 0);

    const stored = await User.findByPk(user.user.id);
    expect(stored.experience_points).toBe(25 + rewards);
    expect(rewards).toBeGreaterThanOrEqual(550); // FIRST_SCAN (50) + PAYDAY (500)
    expect(stored.current_level).toBe(Math.floor(stored.experience_points / 100) + 1);
  });
});
