const fs = require('fs');
const request = require('supertest');
const env = require('../src/config/env');
const HeuristicRanker = require('../src/services/heuristics/heuristic_ranker');
const PythonMLService = require('../src/services/ai/python_ml.service');
const { Analysis, AnalysisRefinement, Specimen, UserAchievement, Achievement } = require('../src/models');
const { createApp, NOT_A_ROCK, auth, createGuest, registerUser, createAdmin, recognize, makeImage } = require('./helpers');

const app = createApp();


const storedImages = () => fs.readdirSync(env.UPLOAD_DIR);

describe('Automated Analysis & Fallback Pipeline APIs (HU-03, HU-04, HU-05, HU-06, HU-16, HT-03, HT-05)', () => {
  let authToken = '';
  let analysisId = '';

  beforeAll(async () => {
    const res = await request(app).post('/auth/anonymous');
    authToken = res.body.data.token;
  });

  test('POST /analysis - Should reject non-specimen image with HTTP 422 (422 NON SPECIMEN IMAGE)', async () => {
    const before = storedImages().length;
    const res = await request(app)
      .post('/analysis')
      .set('Authorization', `Bearer ${authToken}`)
      .attach('image', NOT_A_ROCK)
      .expect(422);

    expect(res.body.success).toBe(false);
    expect(res.body.statusCode).toBe(422);
    expect(res.body.errorCode).toBe('422_NON_SPECIMEN_IMAGE');
    expect(res.body.message).toContain('422 NON SPECIMEN IMAGE');

    // The rejected photo is not kept on disk.
    expect(storedImages()).toHaveLength(before);
  });

  test('POST /analysis - Should analyze valid specimen and execute heuristic fallback', async () => {
    const res = await recognize(app, authToken, 'quartz').expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.analysis_id).toBeDefined();
    expect(res.body.data.provider_used).toBe('heuristic');
    expect(res.body.data.candidates.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.educational_explanation).toBeDefined();
    expect(res.body.data.refinement_questions.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.primary_specimen.id).toBe('quartz');

    analysisId = res.body.data.analysis_id;
  });

  test('GET /analysis/:id - Should retrieve analysis details and explanation (HU-05)', async () => {
    const res = await request(app)
      .get(`/analysis/${analysisId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(analysisId);
    expect(res.body.data.candidates.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.educational_explanation).toBeDefined();
    expect(res.body.data.image_url).toMatch(/^\/uploads\/analyses\/[0-9a-f-]+\.jpg$/);
  });

  test('POST /analysis/:id/refine - Should submit physical refinement answers (HU-06)', async () => {
    const res = await request(app)
      .post(`/analysis/${analysisId}/refine`)
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
    expect(await AnalysisRefinement.count({ where: { analysis_id: analysisId } })).toBe(2);
  });

  test('the recognition history lists the analyses of the authenticated user', async () => {
    await recognize(app, authToken, 'pyrite').expect(200);
    const res = await request(app).get('/analysis?limit=1&page=1').set(auth(authToken)).expect(200);

    expect(res.body.data.analyses).toHaveLength(1);
    expect(res.body.data.analyses[0].raw_ai_response).toBeUndefined();
    expect(res.body.data.analyses[0].primary_specimen.id).toBe('pyrite'); // newest first
    expect(res.body.data.pagination).toMatchObject({ total: 2, page: 1, limit: 1, total_pages: 2 });

    await request(app).get('/analysis?limit=abc').set(auth(authToken)).expect(400);
  });
});

describe('Uploaded images', () => {
  let token;

  beforeAll(async () => {
    token = (await registerUser(app)).token;
  });

  test('an image is required and must be JPEG, PNG or WebP', async () => {
    const missing = await request(app).post('/analysis').set(auth(token)).expect(400);
    expect(missing.body.message).toMatch(/Image file is required/);

    const before = storedImages().length;
    const wrongType = await request(app)
      .post('/analysis')
      .set(auth(token))
      .attach('image', Buffer.from('%PDF-1.4'), { filename: 'rock.pdf', contentType: 'application/pdf' })
      .expect(400);
    expect(wrongType.body.message).toMatch(/Invalid file format/);
    expect(storedImages()).toHaveLength(before);
  });

  test('the stored file extension comes from the MIME type, not from the file name', async () => {
    const res = await request(app)
      .post('/analysis')
      .set(auth(token))
      .attach('image', Buffer.alloc(600, 1), { filename: 'payload.html', contentType: 'image/png' })
      .expect(200);

    expect(res.body.data).toBeDefined();
    const analysis = await Analysis.findByPk(res.body.data.analysis_id);
    expect(analysis.image_url).toMatch(/\.png$/);
    expect(analysis.image_url).not.toMatch(/html/);
  });

  test('images above 8 MB are rejected and leave nothing behind', async () => {
    const before = storedImages().length;
    const res = await request(app)
      .post('/analysis')
      .set(auth(token))
      .attach('image', Buffer.alloc(8 * 1024 * 1024 + 1024), { filename: 'huge.jpg', contentType: 'image/jpeg' })
      .expect(413);

    expect(res.body.message).toMatch(/8 MB/);
    expect(storedImages()).toHaveLength(before);
  });

  test('uploads of unauthenticated requests are refused without touching the disk', async () => {
    const before = storedImages().length;
    await request(app).post('/analysis').attach('image', makeImage(600)).expect(401);
    expect(storedImages()).toHaveLength(before);
  });

  test('images of accepted recognitions are kept', async () => {
    const before = storedImages().length;
    await recognize(app, token, 'quartz').expect(200);
    expect(storedImages()).toHaveLength(before + 1);
  });
});

describe('Ownership of analyses', () => {
  let owner;
  let analysisId;

  beforeAll(async () => {
    owner = await registerUser(app);
    analysisId = (await recognize(app, owner.token, 'quartz').expect(200)).body.data.analysis_id;
  });

  test('another user can neither read nor refine a recognition', async () => {
    const stranger = await registerUser(app);

    const read = await request(app).get(`/analysis/${analysisId}`).set(auth(stranger.token)).expect(403);
    expect(read.body.errorCode).toBe('403_FORBIDDEN');

    const answers = [{ question_type: 'hardness', user_answer: 'Raya el vidrio (Duro >= 6)' }];
    await request(app).post(`/analysis/${analysisId}/refine`).set(auth(stranger.token)).send({ answers }).expect(403);

    // Nothing was altered by the rejected attempt.
    const analysis = await Analysis.findByPk(analysisId);
    expect(analysis.refinement_status).toBe('none');
    expect(await AnalysisRefinement.count({ where: { analysis_id: analysisId } })).toBe(0);
    expect(await UserAchievement.count({ where: { user_id: stranger.user.id, is_unlocked: true } })).toBe(0);
  });

  test('a guest session cannot read a registered user\'s analysis either', async () => {
    const guest = await createGuest(app);
    await request(app).get(`/analysis/${analysisId}`).set(auth(guest.token)).expect(403);
  });

  test('administrators can read any recognition but cannot refine it', async () => {
    const admin = await createAdmin();

    const read = await request(app).get(`/analysis/${analysisId}`).set(auth(admin.token)).expect(200);
    expect(read.body.data.id).toBe(analysisId);

    const answers = [{ question_type: 'hardness', user_answer: 'Raya el vidrio (Duro >= 6)' }];
    await request(app).post(`/analysis/${analysisId}/refine`).set(auth(admin.token)).send({ answers }).expect(403);
  });

  test('missing analyses are 404, and all endpoints need a token', async () => {
    await request(app).get('/analysis/does-not-exist').set(auth(owner.token)).expect(404);
    await request(app).post('/analysis/does-not-exist/refine').set(auth(owner.token)).send({
      answers: [{ question_type: 'hardness', user_answer: 'x' }]
    }).expect(404);

    await request(app).get(`/analysis/${analysisId}`).expect(401);
    await request(app).get('/analysis').expect(401);
    await request(app).post(`/analysis/${analysisId}/refine`).send({}).expect(401);
  });
});

describe('Refinement', () => {
  let user;
  let analysisId;

  beforeAll(async () => {
    user = await registerUser(app);
    analysisId = (await recognize(app, user.token, 'quartz').expect(200)).body.data.analysis_id;
  });

  test('answers are validated instead of crashing the server', async () => {
    const refine = (payload) => request(app).post(`/analysis/${analysisId}/refine`).set(auth(user.token)).send(payload);

    expect((await refine({})).status).toBe(400);
    expect((await refine({ answers: [] })).status).toBe(400);
    expect((await refine({ answers: 'hardness' })).status).toBe(400);
    expect((await refine({ answers: [{ question_type: 'hardness' }] })).status).toBe(400);
    expect((await refine({ answers: [{ question_type: 'hardness', user_answer: 42 }] })).status).toBe(400);
    expect((await refine({ answers: [{ question_type: 'smell', user_answer: 'fuerte' }] })).status).toBe(400);
    await request(app).post(`/analysis/${analysisId}/refine`).set(auth(user.token)).expect(400);

    expect((await Analysis.findByPk(analysisId)).refinement_status).toBe('none');
  });

  test('refining adjusts the scores of the candidates and unlocks REFINEMENT_MASTER', async () => {
    const res = await request(app)
      .post(`/analysis/${analysisId}/refine`)
      .set(auth(user.token))
      .send({ answers: [{ question_type: 'magnetism', user_answer: 'Sí, fuertemente magnético' }] })
      .expect(200);

    expect(res.body.data.unlocked_achievements.map((a) => a.code)).toContain('REFINEMENT_MASTER');
    const scores = res.body.data.updated_candidates.map((c) => c.confidence_score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));

    // Refining again does not award the achievement a second time.
    const again = await request(app)
      .post(`/analysis/${analysisId}/refine`)
      .set(auth(user.token))
      .send({ answers: [{ question_type: 'streak', user_answer: 'Raya blanca o incolora' }] })
      .expect(200);
    expect(again.body.data.unlocked_achievements).toHaveLength(0);

    const achievement = await Achievement.findOne({ where: { code: 'REFINEMENT_MASTER' } });
    expect(await UserAchievement.count({ where: { user_id: user.user.id, achievement_id: achievement.id } })).toBe(1);
  });
});

describe('Refinement changes the ranking according to what the user observed', () => {
  const candidates = () => [
    { specimen_id: 'magnetite', specimen_name: 'Magnetita', category: 'mineral', confidence_score: 0.8, rationale: 'base', rank: 1, provider: 'heuristic' },
    { specimen_id: 'quartz', specimen_name: 'Cuarzo', category: 'mineral', confidence_score: 0.7, rationale: 'base', rank: 2, provider: 'heuristic' },
    { specimen_id: 'calcite', specimen_name: 'Calcita', category: 'mineral', confidence_score: 0.6, rationale: 'base', rank: 3, provider: 'heuristic' }
  ];

  const refineWith = async (magnetismAnswer) => {
    const user = await registerUser(app);
    const spy = jest.spyOn(HeuristicRanker, 'rank').mockResolvedValueOnce(candidates());
    const recognition = await recognize(app, user.token, 'quartz').expect(200);
    spy.mockRestore();
    expect(recognition.body.data.primary_specimen.id).toBe('magnetite');

    const res = await request(app)
      .post(`/analysis/${recognition.body.data.analysis_id}/refine`)
      .set(auth(user.token))
      .send({ answers: [{ question_type: 'magnetism', user_answer: magnetismAnswer }] })
      .expect(200);

    const scores = Object.fromEntries(res.body.data.updated_candidates.map((c) => [c.specimen_id, c.confidence_score]));
    const order = res.body.data.updated_candidates.map((c) => c.specimen_id);
    const stored = await AnalysisRefinement.findOne({ where: { analysis_id: recognition.body.data.analysis_id } });
    return { scores, order, stored };
  };

  test('"not magnetic" lowers the magnetic candidate and leaves the others as they were', async () => {
    const { scores, order, stored } = await refineWith('No, nada magnético');

    expect(scores.magnetite).toBeCloseTo(0.5);
    expect(scores.quartz).toBeCloseTo(0.7);
    expect(scores.calcite).toBeCloseTo(0.6);
    expect(order).toEqual(['quartz', 'calcite', 'magnetite']);
    expect(stored.confidence_delta).toBeCloseTo(-0.30); // the effect on the selected candidate
  });

  test('"strongly magnetic" raises the magnetic candidate and lowers the others', async () => {
    const { scores, order, stored } = await refineWith('Sí, fuertemente magnético');

    expect(scores.magnetite).toBeCloseTo(0.98); // 0.8 + 0.2, capped
    expect(scores.quartz).toBeCloseTo(0.4);
    expect(scores.calcite).toBeCloseTo(0.3);
    expect(order).toEqual(['magnetite', 'quartz', 'calcite']);
    expect(stored.confidence_delta).toBeCloseTo(0.20);
  });

  test('a weak attraction changes nothing', async () => {
    const { scores, order, stored } = await refineWith('Atracción débil');

    expect(scores).toMatchObject({ magnetite: 0.8, quartz: 0.7, calcite: 0.6 });
    expect(order).toEqual(['magnetite', 'quartz', 'calcite']);
    expect(stored.confidence_delta).toBe(0);
  });
});

describe('Robustness of the recognition pipeline', () => {
  test('a rock created through the API without luster or fracture can be the best match', async () => {
    const admin = await createAdmin();
    const user = await registerUser(app);

    const created = await request(app)
      .post('/rock')
      .set(auth(admin.token))
      .send({
        name: `Roca sin detalles ${Date.now()}`,
        description: 'Muestra registrada solo con los datos mínimos',
        imgUrl: 'https://example.com/minimal.jpg',
        categoryId: 1,
        typeId: 1
      })
      .expect(201);
    const minimal = created.body.rock;
    expect(minimal.luster).toBeNull();
    expect(minimal.fracture).toBeNull();

    const spy = jest.spyOn(HeuristicRanker, 'rank').mockResolvedValueOnce([
      { specimen_id: minimal.id, specimen_name: minimal.name_es, category: minimal.category, confidence_score: 0.9, rationale: 'prueba', rank: 1, provider: 'heuristic' }
    ]);

    const res = await recognize(app, user.token, 'quartz').expect(200);
    spy.mockRestore();

    expect(res.body.data.primary_specimen.id).toBe(minimal.id);
    expect(res.body.data.educational_explanation).toContain(minimal.name_es);
    expect(res.body.data.educational_explanation).not.toMatch(/undefined|null/);
  });

  test('ML suggestions for specimens outside the catalog are discarded instead of breaking storage', async () => {
    const user = await registerUser(app);
    const spy = jest.spyOn(PythonMLService, 'predict').mockResolvedValueOnce({
      available: true,
      provider: 'ml_python',
      predictions: [
        { specimen_id: 'unobtainium', confidence_score: 0.95, rationale: 'fantasma', rank: 1 },
        { specimen_id: 'pyrite', confidence_score: 0.9, rationale: 'real', rank: 2 }
      ]
    });

    const res = await recognize(app, user.token, 'quartz');
    spy.mockRestore();

    expect(res.status).toBe(200);
    expect(res.body.data.provider_used).toBe('ml_python');
    expect(res.body.data.primary_specimen.id).toBe('pyrite');
    expect(res.body.data.candidates.map((candidate) => candidate.specimen_id)).toEqual(['pyrite']);
    expect(await Specimen.findByPk('unobtainium')).toBeNull();
  });

  test('when no ML suggestion belongs to the catalog the heuristic ranking takes over', async () => {
    const user = await registerUser(app);
    const spy = jest.spyOn(PythonMLService, 'predict').mockResolvedValueOnce({
      available: true,
      provider: 'ml_python',
      predictions: [{ specimen_id: 'unobtainium', confidence_score: 0.95, rationale: 'fantasma' }]
    });

    const res = await recognize(app, user.token, 'quartz').expect(200);
    spy.mockRestore();

    expect(res.body.data.provider_used).toBe('heuristic');
    expect(res.body.data.primary_specimen.id).toBe('quartz');
  });

  test('the non-specimen simulation flag is honoured and leaves no analysis behind', async () => {
    const user = await registerUser(app);
    const before = await Analysis.count({ where: { user_id: user.user.id } });

    const res = await request(app)
      .post('/analysis?simulate_non_specimen=true')
      .set(auth(user.token))
      .attach('image', makeImage(600))
      .expect(422);
    expect(res.body.errorCode).toBe('422_NON_SPECIMEN_IMAGE');
    expect(await Analysis.count({ where: { user_id: user.user.id } })).toBe(before);
  });
});
