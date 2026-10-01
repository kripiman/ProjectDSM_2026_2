const request = require('supertest');
const { UserQuizAttempt, User, Quiz } = require('../src/models');
const { createApp, auth, createGuest, registerUser } = require('./helpers');

const app = createApp();

describe('Educational Quizzes APIs (HT-01, HT-02)', () => {
  let authToken = '';
  let quizId = '';
  let questions = [];

  beforeAll(async () => {
    const res = await request(app).post('/auth/anonymous');
    authToken = res.body.data.token;
  });

  test('GET /quiz - Should list available quizzes', async () => {
    const res = await request(app)
      .get('/quiz')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);

    quizId = res.body.data[0].id;
  });

  test('GET /quiz/:id - Should retrieve quiz questions with options', async () => {
    const res = await request(app)
      .get(`/quiz/${quizId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.questions.length).toBeGreaterThanOrEqual(1);
    res.body.data.questions.forEach((question) => expect(question.correct_option_index).toBeUndefined());
    questions = res.body.data.questions;
  });

  test('POST /quiz/:id/submit - Should evaluate answers, calculate score, and grant XP', async () => {
    const answers = questions.map(q => ({
      question_id: q.id,
      selected_option_index: 0 // sample submission
    }));

    const res = await request(app)
      .post(`/quiz/${quizId}/submit`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ answers })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.total_questions).toBe(questions.length);
    expect(res.body.data.xp_earned).toBeGreaterThanOrEqual(0);
    expect(res.body.data.breakdown.length).toBe(questions.length);
  });

  test('a passing attempt grants the full reward and a failing one a fraction of it', async () => {
    const user = await registerUser(app);
    const correct = [
      { question_id: 'q1_mohs_scale', selected_option_index: 2 },
      { question_id: 'q2_fools_gold', selected_option_index: 1 },
      { question_id: 'q3_magnetism', selected_option_index: 0 }
    ];

    const failed = await request(app)
      .post(`/quiz/${quizId}/submit`)
      .set(auth(user.token))
      .send({ answers: correct.map((answer) => ({ ...answer, selected_option_index: 3 })) })
      .expect(200);
    expect(failed.body.data).toMatchObject({ score: 0, passed: false, xp_earned: 20 });

    const passed = await request(app).post(`/quiz/${quizId}/submit`).set(auth(user.token)).send({ answers: correct }).expect(200);
    expect(passed.body.data).toMatchObject({ score: 100, passed: true, correct_answers: 3, xp_earned: 100 });

    const stored = await User.findByPk(user.user.id);
    // 20 + 100 from the attempts + 150 for the QUIZ_CHAMPION achievement
    expect(stored.experience_points).toBe(270);
    expect(stored.current_level).toBe(3);
    expect(await UserQuizAttempt.count({ where: { user_id: user.user.id } })).toBe(2);
  });

  test('the reward is paid once per quiz: retaking it only serves to practise', async () => {
    const user = await registerUser(app);
    const correct = [
      { question_id: 'q1_mohs_scale', selected_option_index: 2 },
      { question_id: 'q2_fools_gold', selected_option_index: 1 },
      { question_id: 'q3_magnetism', selected_option_index: 0 }
    ];
    const wrong = correct.map((answer) => ({ ...answer, selected_option_index: 3 }));
    const submit = (answers) => request(app).post(`/quiz/${quizId}/submit`).set(auth(user.token)).send({ answers });

    // Only the first failed attempt pays the consolation reward; empty submissions earn nothing more.
    expect((await submit(wrong).expect(200)).body.data.xp_earned).toBe(20);
    expect((await submit(wrong).expect(200)).body.data.xp_earned).toBe(0);
    expect((await submit([]).expect(200)).body.data.xp_earned).toBe(0);

    // The first pass pays in full, every later one nothing.
    expect((await submit(correct).expect(200)).body.data.xp_earned).toBe(100);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect((await submit(correct).expect(200)).body.data.xp_earned).toBe(0);
    }

    const stored = await User.findByPk(user.user.id);
    expect(stored.experience_points).toBe(20 + 100 + 150); // attempts + QUIZ_CHAMPION
    expect(await UserQuizAttempt.count({ where: { user_id: user.user.id } })).toBe(7);
  });

  test('unanswered questions can be sent as null', async () => {
    const user = await registerUser(app);
    const res = await request(app)
      .post(`/quiz/${quizId}/submit`)
      .set(auth(user.token))
      .send({ answers: [
        { question_id: 'q1_mohs_scale', selected_option_index: 2 },
        { question_id: 'q2_fools_gold', selected_option_index: null }
      ] })
      .expect(200);

    expect(res.body.data).toMatchObject({ correct_answers: 1, total_questions: 3 });
    const skipped = res.body.data.breakdown.find((entry) => entry.question_id === 'q2_fools_gold');
    expect(skipped).toMatchObject({ user_selected_index: null, is_correct: false });
  });

  test('a deactivated quiz can neither be read nor taken', async () => {
    const user = await registerUser(app);
    await Quiz.update({ is_active: false }, { where: { id: quizId } });

    try {
      await request(app).get(`/quiz/${quizId}`).set(auth(user.token)).expect(404);
      await request(app).post(`/quiz/${quizId}/submit`).set(auth(user.token)).send({ answers: [] }).expect(404);
      const list = await request(app).get('/quiz').set(auth(user.token)).expect(200);
      expect(list.body.data.map((quiz) => quiz.id)).not.toContain(quizId);
      expect(await UserQuizAttempt.count({ where: { user_id: user.user.id } })).toBe(0);
    } finally {
      await Quiz.update({ is_active: true }, { where: { id: quizId } });
    }
  });

  test('answers are validated and the quiz must exist', async () => {
    const user = await registerUser(app);
    await request(app).post(`/quiz/${quizId}/submit`).set(auth(user.token)).expect(400);
    await request(app).post(`/quiz/${quizId}/submit`).set(auth(user.token)).send({ answers: 'all' }).expect(400);
    await request(app).post(`/quiz/${quizId}/submit`).set(auth(user.token)).send({ answers: [{ question_id: 'q1_mohs_scale', selected_option_index: 'two' }] }).expect(400);
    await request(app).post('/quiz/nope/submit').set(auth(user.token)).send({ answers: [] }).expect(404);
    await request(app).get('/quiz/nope').set(auth(user.token)).expect(404);
    expect(await UserQuizAttempt.count({ where: { user_id: user.user.id } })).toBe(0);
  });

  test('leaving questions unanswered counts them as wrong', async () => {
    const user = await registerUser(app);
    const res = await request(app)
      .post(`/quiz/${quizId}/submit`)
      .set(auth(user.token))
      .send({ answers: [{ question_id: 'q1_mohs_scale', selected_option_index: 2 }] })
      .expect(200);
    expect(res.body.data).toMatchObject({ correct_answers: 1, total_questions: 3, score: 33, passed: false });
  });

  test('quizzes require authentication, and guests can take them', async () => {
    await request(app).get('/quiz').expect(401);
    await request(app).post(`/quiz/${quizId}/submit`).send({ answers: [] }).expect(401);

    const guest = await createGuest(app);
    await request(app).get('/quiz').set(auth(guest.token)).expect(200);
  });
});
