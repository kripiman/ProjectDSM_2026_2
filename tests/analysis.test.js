const request = require('supertest');
const path = require('path');
const Server = require('../src/utils/server');

const server = new Server();
const app = server.app;

describe('Automated Analysis & Fallback Pipeline APIs (HU-03, HU-04, HU-05, HU-06, HU-16, HT-03, HT-05)', () => {
  let authToken = '';
  let analysisId = '';

  beforeAll(async () => {
    const res = await request(app).post('/api/v1/auth/anonymous');
    authToken = res.body.data.token;
  });

  test('POST /api/v1/analysis - Should reject non-specimen image with HTTP 422 (422 NON SPECIMEN IMAGE)', async () => {
    const filePath = path.resolve(__dirname, 'fixtures/not_a_rock.jpg');
    const res = await request(app)
      .post('/api/v1/analysis')
      .set('Authorization', `Bearer ${authToken}`)
      .attach('image', filePath)
      .expect(422);

    expect(res.body.success).toBe(false);
    expect(res.body.statusCode).toBe(422);
    expect(res.body.errorCode).toBe('422_NON_SPECIMEN_IMAGE');
    expect(res.body.message).toContain('422 NON SPECIMEN IMAGE');
  });

  test('POST /api/v1/analysis - Should analyze valid specimen and execute heuristic fallback', async () => {
    const filePath = path.resolve(__dirname, 'fixtures/sample_rock.jpg');
    const res = await request(app)
      .post('/api/v1/analysis')
      .set('Authorization', `Bearer ${authToken}`)
      .attach('image', filePath)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.analysis_id).toBeDefined();
    expect(res.body.data.candidates.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.educational_explanation).toBeDefined();
    expect(res.body.data.refinement_questions.length).toBeGreaterThanOrEqual(1);

    analysisId = res.body.data.analysis_id;
  });

  test('GET /api/v1/analysis/:id - Should retrieve analysis details and explanation (HU-05)', async () => {
    const res = await request(app)
      .get(`/api/v1/analysis/${analysisId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(analysisId);
    expect(res.body.data.candidates.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.educational_explanation).toBeDefined();
  });

  test('POST /api/v1/analysis/:id/refine - Should submit physical refinement answers (HU-06)', async () => {
    const res = await request(app)
      .post(`/api/v1/analysis/${analysisId}/refine`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        answers: [
          { question_type: 'hardness', user_answer: 'Raya el vidrio (Duro >= 6)' },
          { question_type: 'magnetism', user_answer: 'No, nada magnético' }
        ]
      })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.refinement_status).toBe('refined');
    expect(res.body.data.updated_candidates.length).toBeGreaterThanOrEqual(1);
  });

  test('POST /api/v1/feedback/:id - Should submit user feedback on analysis accuracy (HU-16)', async () => {
    const res = await request(app)
      .post(`/api/v1/feedback/${analysisId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        rating: 'correct',
        comments: 'Excelente identificación, coincidió con mi prueba de dureza'
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.rating).toBe('correct');
  });
});
