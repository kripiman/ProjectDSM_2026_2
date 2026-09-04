const request = require('supertest');
const Server = require('../src/utils/server');

const server = new Server();
const app = server.app;

describe('Educational Quizzes APIs (HT-01, HT-02)', () => {
  let authToken = '';
  let quizId = '';
  let questions = [];

  beforeAll(async () => {
    const res = await request(app).post('/api/v1/auth/anonymous');
    authToken = res.body.data.token;
  });

  test('GET /api/v1/quiz - Should list available quizzes', async () => {
    const res = await request(app)
      .get('/api/v1/quiz')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);

    quizId = res.body.data[0].id;
  });

  test('GET /api/v1/quiz/:id - Should retrieve quiz questions with options', async () => {
    const res = await request(app)
      .get(`/api/v1/quiz/${quizId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.questions.length).toBeGreaterThanOrEqual(1);
    questions = res.body.data.questions;
  });

  test('POST /api/v1/quiz/:id/submit - Should evaluate answers, calculate score, and grant XP', async () => {
    const answers = questions.map(q => ({
      question_id: q.id,
      selected_option_index: 0 // sample submission
    }));

    const res = await request(app)
      .post(`/api/v1/quiz/${quizId}/submit`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ answers })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.total_questions).toBe(questions.length);
    expect(res.body.data.xp_earned).toBeGreaterThanOrEqual(0);
    expect(res.body.data.breakdown.length).toBe(questions.length);
  });
});
