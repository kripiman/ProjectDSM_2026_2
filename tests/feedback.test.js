const request = require('supertest');
const { Feedback } = require('../src/models');
const { createApp, auth, createGuest, registerUser, createAdmin, recognize } = require('./helpers');

const app = createApp();


describe('Recognition feedback', () => {
  let owner;
  let stranger;
  let admin;
  let analysisId;

  beforeAll(async () => {
    owner = await registerUser(app);
    stranger = await registerUser(app);
    admin = await createAdmin();
    const res = await recognize(app, owner.token, 'quartz').expect(200);
    analysisId = res.body.data.analysis_id;
  });

  describe('who can send feedback', () => {
    test('requests without a token are rejected', async () => {
      await request(app).post(`/feedback/analysis/${analysisId}`).send({ rating: 'correct' }).expect(401);
      await request(app).get(`/feedback/analysis/${analysisId}`).expect(401);
      await request(app).put(`/feedback/analysis/${analysisId}`).send({ rating: 'correct' }).expect(401);
      await request(app).get('/feedback/me').expect(401);
    });

    test('guest sessions hold a valid token but cannot send feedback', async () => {
      const guest = await createGuest(app);
      const recognition = await recognize(app, guest.token, 'quartz').expect(200);

      const res = await request(app)
        .post(`/feedback/analysis/${recognition.body.data.analysis_id}`)
        .set(auth(guest.token))
        .send({ rating: 'correct' })
        .expect(403);

      expect(res.body.errorCode).toBe('403_FORBIDDEN');
      expect(await Feedback.count({ where: { analysis_id: recognition.body.data.analysis_id } })).toBe(0);
      await request(app).get('/feedback/me').set(auth(guest.token)).expect(403);
    });

    test('feedback is only accepted under /feedback/analysis/:id', async () => {
      await request(app).post(`/feedback/${analysisId}`).set(auth(owner.token)).send({ rating: 'correct' }).expect(404);
    });
  });

  describe('own recognitions', () => {
    test('POST /feedback/analysis/:id - the owner evaluates the result (HU-16)', async () => {
      const res = await request(app)
        .post(`/feedback/analysis/${analysisId}`)
        .set(auth(owner.token))
        .send({
          rating: 'correct',
          comments: 'Excelente identificación, coincidió con mi prueba de dureza'
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toMatchObject({
        analysis_id: analysisId,
        user_id: owner.user.id,
        rating: 'correct'
      });
    });

    test('a recognition has at most one evaluation', async () => {
      const res = await request(app)
        .post(`/feedback/analysis/${analysisId}`)
        .set(auth(owner.token))
        .send({ rating: 'incorrect' })
        .expect(409);

      expect(res.body.errorCode).toBe('409_CONFLICT');
      expect(await Feedback.count({ where: { analysis_id: analysisId } })).toBe(1);
    });

    test('simultaneous submissions still produce a single evaluation', async () => {
      const recognition = await recognize(app, owner.token, 'pyrite').expect(200);
      const id = recognition.body.data.analysis_id;

      const responses = await Promise.all(
        Array.from({ length: 4 }, () => request(app)
          .post(`/feedback/analysis/${id}`)
          .set(auth(owner.token))
          .send({ rating: 'correct' }))
      );

      expect(responses.filter((res) => res.status === 201)).toHaveLength(1);
      expect(responses.filter((res) => res.status === 409)).toHaveLength(3);
      expect(await Feedback.count({ where: { analysis_id: id } })).toBe(1);
    });

    test('GET /feedback/analysis/:id returns the evaluation already sent', async () => {
      const res = await request(app).get(`/feedback/analysis/${analysisId}`).set(auth(owner.token)).expect(200);
      expect(res.body.data).toMatchObject({ rating: 'correct', analysis_id: analysisId });
      expect(res.body.data.comments).toMatch(/Excelente/);
    });

    test('GET /feedback/analysis/:id is 404 while nothing was sent', async () => {
      const recognition = await recognize(app, owner.token, 'basalt').expect(200);
      await request(app)
        .get(`/feedback/analysis/${recognition.body.data.analysis_id}`)
        .set(auth(owner.token))
        .expect(404);
    });

    test('PUT /feedback/analysis/:id updates the evaluation', async () => {
      const res = await request(app)
        .put(`/feedback/analysis/${analysisId}`)
        .set(auth(owner.token))
        .send({ rating: 'incorrect', comments: 'Me equivoqué', suggested_specimen_id: 'pyrite' })
        .expect(200);

      expect(res.body.data).toMatchObject({ rating: 'incorrect', comments: 'Me equivoqué', suggested_specimen_id: 'pyrite' });
      expect(await Feedback.count({ where: { analysis_id: analysisId } })).toBe(1);

      await request(app).put(`/feedback/analysis/${analysisId}`).set(auth(owner.token)).send({}).expect(400);
    });

    test('updating requires an existing evaluation', async () => {
      const recognition = await recognize(app, owner.token, 'sandstone').expect(200);
      await request(app)
        .put(`/feedback/analysis/${recognition.body.data.analysis_id}`)
        .set(auth(owner.token))
        .send({ rating: 'correct' })
        .expect(404);
    });

    test('GET /feedback/me lists only the evaluations of the authenticated user', async () => {
      const mine = await request(app).get('/feedback/me').set(auth(owner.token)).expect(200);
      expect(mine.body.data.feedback.length).toBeGreaterThanOrEqual(2);
      mine.body.data.feedback.forEach((entry) => expect(entry.user_id).toBe(owner.user.id));
      expect(mine.body.data.pagination.total).toBe(mine.body.data.feedback.length);

      const theirs = await request(app).get('/feedback/me').set(auth(stranger.token)).expect(200);
      expect(theirs.body.data.feedback).toHaveLength(0);
    });
  });

  describe('input validation', () => {
    let freshAnalysis;

    beforeAll(async () => {
      const res = await recognize(app, owner.token, 'quartz').expect(200);
      freshAnalysis = res.body.data.analysis_id;
    });

    test('rating is required and must be a known value', async () => {
      const post = (payload) => request(app).post(`/feedback/analysis/${freshAnalysis}`).set(auth(owner.token)).send(payload);

      expect((await post({})).status).toBe(400);
      expect((await post({ rating: 'great' })).status).toBe(400);
      expect((await post({ rating: 'correct', comments: 'x'.repeat(1001) })).status).toBe(400);
      expect(await Feedback.count({ where: { analysis_id: freshAnalysis } })).toBe(0);
    });

    test('a request without body is a 400, not a server error', async () => {
      const res = await request(app).post(`/feedback/analysis/${freshAnalysis}`).set(auth(owner.token)).expect(400);
      expect(res.body.errorCode).toBe('400_VALIDATION_ERROR');
    });

    test('the suggested specimen must exist', async () => {
      const res = await request(app)
        .post(`/feedback/analysis/${freshAnalysis}`)
        .set(auth(owner.token))
        .send({ rating: 'incorrect', suggested_specimen_id: 'unobtainium' })
        .expect(404);
      expect(res.body.message).toMatch(/Suggested specimen/);
    });

    test('the analysis must exist', async () => {
      await request(app).post('/feedback/analysis/does-not-exist').set(auth(owner.token)).send({ rating: 'correct' }).expect(404);
    });

    test('optional fields may be omitted or empty', async () => {
      const res = await request(app)
        .post(`/feedback/analysis/${freshAnalysis}`)
        .set(auth(owner.token))
        .send({ rating: 'uncertain', comments: '' })
        .expect(201);
      expect(res.body.data.comments).toBeNull();
      expect(res.body.data.suggested_specimen_id).toBeNull();
    });
  });

  describe("other people's recognitions", () => {
    test('a user cannot evaluate, read or edit feedback of a recognition they did not make', async () => {
      const fresh = await recognize(app, owner.token, 'basalt').expect(200);
      const id = fresh.body.data.analysis_id;

      const post = await request(app).post(`/feedback/analysis/${id}`).set(auth(stranger.token)).send({ rating: 'incorrect' }).expect(403);
      expect(post.body.message).toMatch(/your own/);
      expect(await Feedback.count({ where: { analysis_id: id } })).toBe(0);

      await request(app).get(`/feedback/analysis/${analysisId}`).set(auth(stranger.token)).expect(403);
      await request(app).put(`/feedback/analysis/${analysisId}`).set(auth(stranger.token)).send({ rating: 'correct' }).expect(403);

      const untouched = await Feedback.findOne({ where: { analysis_id: analysisId } });
      expect(untouched.rating).toBe('incorrect'); // set by the owner in a previous test
      expect(untouched.user_id).toBe(owner.user.id);
    });

    test('administrators can read evaluations but cannot write them for other users', async () => {
      const fresh = await recognize(app, owner.token, 'pyrite').expect(200);
      const id = fresh.body.data.analysis_id;

      await request(app).post(`/feedback/analysis/${id}`).set(auth(admin.token)).send({ rating: 'correct' }).expect(403);
      expect(await Feedback.count({ where: { analysis_id: id } })).toBe(0);

      await request(app).put(`/feedback/analysis/${analysisId}`).set(auth(admin.token)).send({ rating: 'correct' }).expect(403);

      const read = await request(app).get(`/feedback/analysis/${analysisId}`).set(auth(admin.token)).expect(200);
      expect(read.body.data.analysis_id).toBe(analysisId);
    });

    test('administrators evaluate their own recognitions like any registered user', async () => {
      const mine = await recognize(app, admin.token, 'quartz').expect(200);
      await request(app)
        .post(`/feedback/analysis/${mine.body.data.analysis_id}`)
        .set(auth(admin.token))
        .send({ rating: 'correct' })
        .expect(201);
    });
  });
});
