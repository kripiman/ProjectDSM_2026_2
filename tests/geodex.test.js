const fs = require('fs');
const path = require('path');
const request = require('supertest');
const env = require('../src/config/env');
const GeoDexService = require('../src/services/ai/geodex.service');
const logger = require('../src/utils/logger');
const { Analysis } = require('../src/models');
const realAnswer = require('./fixtures/geodex_identify.json');
const { createApp, auth, registerUser, recognize, makeImage } = require('./helpers');

const app = createApp();

const catalog = [
  { id: 'quartz', name_en: 'Quartz', name_es: 'Cuarzo', scientific_name: 'Silicon Dioxide', category: 'mineral' },
  { id: 'pyrite', name_en: 'Pyrite', name_es: 'Pirita', scientific_name: 'Iron Disulfide', category: 'mineral' },
  { id: 'magnetite', name_en: 'Magnetite', name_es: 'Magnetita', scientific_name: 'Iron(II,III) Oxide', category: 'mineral' },
  { id: 'feldspar', name_en: 'Potassium Feldspar', name_es: 'Feldespato (Ortoclasa)', scientific_name: 'Potassium Aluminium Silicate', category: 'mineral' },
  { id: 'basalt', name_en: 'Basalt', name_es: 'Basalto', scientific_name: 'Extrusive Mafic Volcanic Rock', category: 'igneous_rock' }
];

// An answer shaped like the ones of the live service: a ranked list whose confidence is a
// percentage. tests/fixtures/geodex_identify.json is a complete one.
const answer = (...predictions) => ({
  success: true,
  predictions: predictions.map(([specimenId, confidence, reasoning]) => ({
    specimen_id: specimenId, label: specimenId, confidence, reasoning, catalog_match: true
  }))
});

// What fetch resolves to. A body of `undefined` stands for an answer that is not JSON.
const reply = (body, status = 200, headers = {}) => ({
  ok: status < 400,
  status,
  headers: { get: (name) => headers[name.toLowerCase()] ?? null },
  json: async () => {
    if (body === undefined) throw new Error('not json');
    return body;
  }
});

describe('GeoDex response parsing', () => {
  const parse = (body, topK) => GeoDexService.normalizeResponse(body, catalog, topK);

  test('reads an answer of the live service: ids of the candidates, confidence as a percentage', () => {
    const predictions = parse(realAnswer);

    expect(predictions.map((p) => [p.specimen_id, p.confidence_score, p.rank])).toEqual([
      ['pyrite', 0.97, 1],
      ['magnetite', 0.01, 2],
      ['feldspar', 0.01, 3]
    ]);
    expect(predictions[0]).toMatchObject({
      specimen_name: 'Pirita',
      category: 'mineral',
      rationale: expect.stringMatching(/brass-yellow metallic luster/),
      provider: 'geodex'
    });
  });

  test('a confidence of 1 means 1 %, not 100 %', () => {
    const predictions = parse(answer(['quartz', 1], ['pyrite', 80]));
    expect(predictions.map((p) => [p.specimen_id, p.confidence_score])).toEqual([['pyrite', 0.8], ['quartz', 0.01]]);
  });

  test('ranks by confidence whatever the order of the answer', () => {
    const predictions = parse(answer(['basalt', 10], ['quartz', 82], ['pyrite', 35]));
    expect(predictions.map((p) => [p.specimen_id, p.rank])).toEqual([['quartz', 1], ['pyrite', 2], ['basalt', 3]]);
  });

  test('confidences are kept within 0-1, may be numeric text, and an item without a number is ignored', () => {
    const predictions = parse({
      predictions: [
        { specimen_id: 'quartz', confidence: 250 },
        { specimen_id: 'pyrite', confidence: -5 },
        { specimen_id: 'basalt', confidence: '41' },
        { specimen_id: 'feldspar' },
        { specimen_id: 'magnetite', confidence: 'high' }
      ]
    });
    expect(predictions.map((p) => [p.specimen_id, p.confidence_score])).toEqual([['quartz', 1], ['basalt', 0.41], ['pyrite', 0]]);
  });

  test('uses the best match alone when the ranked list is missing', () => {
    const { result } = realAnswer;
    expect(parse({ success: true, result }).map((p) => p.specimen_id)).toEqual(['pyrite']);
    expect(parse({ success: true, predictions: [], result }).map((p) => p.specimen_id)).toEqual(['pyrite']);
    expect(parse({ result })[0].rationale).toBeTruthy(); // the best match carries no reasoning
  });

  test('without an id the name is matched exactly, ignoring case and accents', () => {
    const predictions = parse({
      predictions: [
        { label: 'PIRITA', confidence: 90 },
        { label: 'Potassium Feldspar', confidence: 50 },
        { label: 'Quartzite', confidence: 40 }, // a different rock, not "quartz"
        { label: 'Silicon Dioxide', confidence: 30 } // scientific names are shared by several specimens
      ]
    });
    expect(predictions.map((p) => p.specimen_id)).toEqual(['pyrite', 'feldspar']);
  });

  test('drops what the local catalog does not contain, and repeated specimens', () => {
    const predictions = parse({
      predictions: [
        { specimen_id: null, label: 'Azurite', confidence: 90, catalog_match: false },
        { specimen_id: 'quartz', confidence: 40 },
        { specimen_id: 'quartz', confidence: 30 }
      ]
    });
    expect(predictions.map((p) => [p.specimen_id, p.confidence_score])).toEqual([['quartz', 0.4]]);
    expect(parse(answer(['granite', 90]))).toEqual([]);
  });

  test('limits the result to top_k and copes with garbage', () => {
    expect(parse(answer(['quartz', 90], ['pyrite', 80], ['basalt', 70], ['feldspar', 60]), 2)).toHaveLength(2);

    const garbage = [
      null, undefined, 'text', 42, [], {}, { predictions: [] }, { predictions: [null, 7, 'x', {}] },
      { predictions: 'pyrite' }, { result: 'pyrite' }
    ];
    for (const body of garbage) {
      expect(parse(body)).toEqual([]);
    }
  });
});

describe('GeoDex client', () => {
  const originals = {};
  let fetchMock;

  const enable = (overrides = {}) => {
    Object.assign(originals, { GEODEX_API_KEY: env.GEODEX_API_KEY, GEODEX_TIMEOUT_MS: env.GEODEX_TIMEOUT_MS });
    env.GEODEX_API_KEY = 'test-geodex-key';
    Object.assign(env, overrides);
  };

  const identify = (file = makeImage(600), extra = {}) => GeoDexService.identify({ filePath: file, catalog, ...extra });

  beforeEach(() => {
    GeoDexService.reset();
    fetchMock = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    Object.assign(env, originals);
  });

  test('is disabled without an API key (the test environment has none), with no network call', async () => {
    expect(env.GEODEX_API_KEY).toBe('');
    expect(GeoDexService.isEnabled()).toBe(false);
    expect(await identify()).toMatchObject({ available: false, predictions: [] });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('a failure is logged so an invalid key or an exhausted quota does not go unnoticed', async () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => {});
    enable();
    fetchMock.mockResolvedValueOnce(reply({ success: false, error: { code: 'QUOTA_EXCEEDED' } }, 429));

    await identify();
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/GeoDex returned HTTP 429 \(QUOTA_EXCEEDED\)/));

    // A disabled provider is not a failure and stays silent.
    warn.mockClear();
    env.GEODEX_API_KEY = '';
    await identify();
    expect(warn).not.toHaveBeenCalled();
  });

  test('sends the image and the local catalog to the identify endpoint, with the key in a header', async () => {
    enable();
    fetchMock.mockResolvedValueOnce(reply(answer(['pyrite', 91])));

    const file = makeImage(700);
    const result = await identify(file, { mimeType: 'image/png' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`${env.GEODEX_API_URL}/api/v1/identify`);
    expect(options.method).toBe('POST');
    expect(options.headers.Authorization).toBe('Bearer test-geodex-key');
    expect(options.headers['Content-Type']).toBe('application/json');

    const body = JSON.parse(options.body);
    expect(body.image.mime_type).toBe('image/png');
    expect(Buffer.from(body.image.base64, 'base64')).toHaveLength(700);
    expect(body.top_k).toBe(3);
    expect(body.candidates.map((c) => c.id)).toEqual(catalog.map((c) => c.id));
    expect(body.candidates[0]).toMatchObject({ name_en: 'Quartz', name_es: 'Cuarzo', scientific_name: 'Silicon Dioxide' });
    expect(options.body).not.toContain('test-geodex-key'); // the key is never part of the payload
    expect(options.body).not.toContain(file); // nor is the local path of the file

    expect(result).toMatchObject({ available: true, provider: 'geodex' });
    expect(result.predictions[0]).toMatchObject({ specimen_id: 'pyrite', confidence_score: 0.91, rank: 1 });
  });

  test.each([
    [401, { success: false, error: { code: 'INVALID_API_KEY', message: 'Invalid API key.' } }, /HTTP 401 \(INVALID_API_KEY\)/],
    [429, { success: false, error: { code: 'QUOTA_EXCEEDED', message: 'Daily quota reached' } }, /HTTP 429 \(QUOTA_EXCEEDED\)/],
    [500, undefined, /HTTP 500/],
    [422, { detail: [{ loc: ['body', 'image'], msg: 'Field required' }] }, /HTTP 422/]
  ])('an HTTP %i answer is reported as unavailable so another provider can take over', async (status, body, reason) => {
    enable();
    fetchMock.mockResolvedValueOnce(reply(body, status));

    const result = await identify();
    expect(result.available).toBe(false);
    expect(result.reason).toMatch(reason);
    expect(result.predictions).toEqual([]);
  });

  test('network failures and unusable answers never throw', async () => {
    enable();

    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const offline = await identify();
    expect(offline).toMatchObject({ available: false });
    expect(offline.reason).toMatch(/unavailable/);

    fetchMock.mockResolvedValueOnce(reply(undefined)); // 200 with a body that is not JSON
    expect((await identify()).available).toBe(false);

    fetchMock.mockResolvedValueOnce(reply(answer(['granite', 90]))); // a rock the catalog does not have
    const unknown = await identify();
    expect(unknown).toMatchObject({ available: false, predictions: [] });
    expect(unknown.reason).toMatch(/local catalog/);

    expect((await identify('/does/not/exist.jpg')).available).toBe(false);
  });

  test('a slow service is abandoned after the configured timeout', async () => {
    enable({ GEODEX_TIMEOUT_MS: 40 });
    fetchMock.mockImplementationOnce((url, options) => new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })));
    }));

    const started = Date.now();
    const result = await identify();
    expect(result).toMatchObject({ available: false, reason: 'GeoDex timeout after 40 ms' });
    expect(Date.now() - started).toBeLessThan(2000);
  });

  describe('when the service refuses the key or the quota', () => {
    const quotaExceeded = { success: false, error: { code: 'QUOTA_EXCEEDED' } };
    const minutes = (count) => count * 60 * 1000;
    const START = Date.UTC(2026, 9, 1, 12, 0, 0);
    let clock;

    beforeEach(() => {
      enable();
      jest.spyOn(logger, 'warn').mockImplementation(() => {});
      clock = jest.spyOn(Date, 'now').mockReturnValue(START);
    });

    test.each([401, 403, 429])('after an HTTP %i no more queries are sent, so no photo is uploaded in vain', async (status) => {
      fetchMock.mockResolvedValueOnce(reply(quotaExceeded, status));

      const first = await identify();
      expect(first.reason).toBe(`GeoDex returned HTTP ${status} (QUOTA_EXCEEDED)`);

      const second = await identify();
      expect(second).toMatchObject({ available: false, predictions: [] });
      expect(second.reason).toBe(`GeoDex paused until ${new Date(START + minutes(15)).toISOString()} after HTTP ${status} (QUOTA_EXCEEDED)`);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringMatching(/no more queries will be sent until/));
    });

    test('queries resume once the pause is over', async () => {
      fetchMock.mockResolvedValueOnce(reply(quotaExceeded, 429));
      await identify();

      clock.mockReturnValue(START + minutes(15) - 1);
      expect((await identify()).reason).toMatch(/paused until/);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      clock.mockReturnValue(START + minutes(15));
      fetchMock.mockResolvedValueOnce(reply(answer(['pyrite', 90])));
      expect((await identify()).available).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    test('the pause follows Retry-After when the service sends it, up to a day', async () => {
      fetchMock.mockResolvedValueOnce(reply(quotaExceeded, 429, { 'retry-after': '120' }));
      await identify();

      clock.mockReturnValue(START + 119 * 1000);
      expect((await identify()).available).toBe(false);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      clock.mockReturnValue(START + 120 * 1000);
      fetchMock.mockResolvedValueOnce(reply(quotaExceeded, 429, { 'retry-after': '999999999' }));
      await identify();

      const day = minutes(24 * 60);
      clock.mockReturnValue(START + 120 * 1000 + day - 1);
      expect((await identify()).reason).toMatch(/paused until/);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    test.each([
      ['an HTTP 500', () => reply(undefined, 500)],
      ['an HTTP 422', () => reply({ detail: [] }, 422)],
      ['an answer with nothing usable', () => reply(answer(['granite', 90]))]
    ])('%s does not pause the provider: the next photo is tried', async (label, response) => {
      fetchMock.mockResolvedValueOnce(response());
      expect((await identify()).available).toBe(false);

      fetchMock.mockRejectedValueOnce(new Error('ECONNRESET'));
      expect((await identify()).reason).toMatch(/unavailable/);

      fetchMock.mockResolvedValueOnce(reply(answer(['pyrite', 90])));
      expect((await identify()).available).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    test('reset() lifts the pause', async () => {
      fetchMock.mockResolvedValueOnce(reply(quotaExceeded, 429));
      await identify();
      GeoDexService.reset();

      fetchMock.mockResolvedValueOnce(reply(answer(['pyrite', 90])));
      expect((await identify()).available).toBe(true);
    });
  });

  describe('a photo that was already identified', () => {
    beforeEach(() => {
      enable();
    });

    test('is answered from memory, without spending a query', async () => {
      fetchMock.mockResolvedValueOnce(reply(realAnswer));
      const file = makeImage(900);

      const first = await identify(file);
      const second = await identify(file);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(first.cached).toBeUndefined();
      expect(second).toMatchObject({ available: true, provider: 'geodex', cached: true });
      expect(second.predictions).toEqual(first.predictions);
      expect(second.raw).toEqual(first.raw);
    });

    test('is recognised by its content, not by its name', async () => {
      fetchMock.mockResolvedValueOnce(reply(realAnswer));
      const file = makeImage(900);
      const copy = path.join(path.dirname(file), 'copy_of_the_same_photo.jpg');
      fs.copyFileSync(file, copy);

      await identify(file);
      expect((await identify(copy)).cached).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    test('is asked again when the photo or the catalog differ', async () => {
      fetchMock.mockResolvedValue(reply(realAnswer));
      const file = makeImage(900);

      await identify(file);
      await identify(makeImage(900)); // same size, other content
      await identify(file, { catalog: catalog.slice(0, 3) }); // the model would choose among other candidates
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    test('is not remembered when the attempt failed', async () => {
      const file = makeImage(900);
      fetchMock.mockResolvedValueOnce(reply(undefined, 500));
      expect((await identify(file)).available).toBe(false);

      fetchMock.mockResolvedValueOnce(reply(realAnswer));
      expect((await identify(file)).cached).toBeUndefined();
      expect((await identify(file)).cached).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    test('hands out copies: changing one does not change what is remembered', async () => {
      fetchMock.mockResolvedValueOnce(reply(realAnswer));
      const file = makeImage(900);

      const first = await identify(file);
      first.predictions[0].confidence_score = 0;
      first.raw.result.label = 'tampered';

      const second = await identify(file);
      const third = await identify(file);
      expect(second.predictions[0].confidence_score).toBe(0.97);
      expect(second.raw.result.label).toBe('pyrite');
      second.predictions.length = 0;
      expect(third.predictions).toHaveLength(3);
    });

    test('is forgotten after enough other photos, least recently used first', async () => {
      fetchMock.mockResolvedValue(reply(answer(['pyrite', 90])));
      const keep = makeImage(900);
      const forget = makeImage(901);

      await identify(forget);
      await identify(keep);
      for (let photo = 2; photo < GeoDexService.ANSWER_CACHE_SIZE; photo += 1) {
        await identify(makeImage(902));
      }
      expect((await identify(keep)).cached).toBe(true); // used again: now the most recent
      await identify(makeImage(903)); // one more than fits: the oldest one goes

      expect((await identify(keep)).cached).toBe(true);
      expect((await identify(forget)).cached).toBeUndefined();
    });

    test('reset() forgets every answer', async () => {
      fetchMock.mockResolvedValue(reply(realAnswer));
      const file = makeImage(900);
      await identify(file);
      GeoDexService.reset();
      expect((await identify(file)).cached).toBeUndefined();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });
});

describe('GeoDex inside the recognition pipeline', () => {
  const originals = {};
  let fetchMock;
  let user;

  beforeAll(async () => {
    user = await registerUser(app);
  });

  beforeEach(() => {
    GeoDexService.reset();
    Object.assign(originals, { GEODEX_API_KEY: env.GEODEX_API_KEY });
    env.GEODEX_API_KEY = 'test-geodex-key';
    fetchMock = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    Object.assign(env, originals);
  });

  test('a GeoDex identification becomes the analysis, the discovery and the stored candidates', async () => {
    fetchMock.mockResolvedValueOnce(reply(realAnswer));

    // The image would be heuristically recognised as quartz; GeoDex says pyrite.
    const res = await recognize(app, user.token, 'quartz').expect(200);

    expect(res.body.data.provider_used).toBe('geodex');
    expect(res.body.data.primary_specimen.id).toBe('pyrite');
    expect(res.body.data.confidence).toBe(0.97);
    expect(res.body.data.candidates.map((c) => [c.specimen_id, c.confidence_score, c.rank])).toEqual([
      ['pyrite', 0.97, 1], ['magnetite', 0.01, 2], ['feldspar', 0.01, 3]
    ]);
    expect(res.body.data.discovery).toMatchObject({ specimen_id: 'pyrite', is_new_discovery: true });

    const stored = await Analysis.findByPk(res.body.data.analysis_id);
    expect(stored.provider_used).toBe('geodex');
    expect(stored.primary_specimen_id).toBe('pyrite');
    expect(stored.raw_ai_response.ml_result.raw.request_id).toBe(realAnswer.request_id);
    expect(stored.raw_ai_response.provider_attempts).toEqual([{ provider: 'geodex', available: true, reason: null }]);

    // Only the recognition endpoint of GeoDex was called (no OpenAI, no local ML).
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([`${env.GEODEX_API_URL}/api/v1/identify`]);
  });

  test('a confidence of 0 is stored as 0, not replaced by a default', async () => {
    fetchMock.mockResolvedValueOnce(reply(answer(['basalt', 0])));
    const res = await recognize(app, user.token, 'quartz').expect(200);

    expect(res.body.data.provider_used).toBe('geodex');
    expect(res.body.data.confidence).toBe(0);
  });

  test('a photo that was already identified costs no query, and the analysis says so', async () => {
    fetchMock.mockResolvedValueOnce(reply(realAnswer));
    const photo = makeImage(512);

    const first = await recognize(app, user.token, photo).expect(200);
    const second = await recognize(app, user.token, photo).expect(200);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second.body.data.analysis_id).not.toBe(first.body.data.analysis_id);
    expect(second.body.data.provider_used).toBe('geodex');
    expect(second.body.data.primary_specimen.id).toBe('pyrite');

    const attempts = async (response) => (await Analysis.findByPk(response.body.data.analysis_id)).raw_ai_response.provider_attempts;
    expect(await attempts(first)).toEqual([{ provider: 'geodex', available: true, reason: null }]);
    expect(await attempts(second)).toEqual([{ provider: 'geodex', available: true, reason: null, cached: true }]);
  });

  test('when GeoDex fails the heuristic provider still completes the recognition, and the reason is kept', async () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => {});
    fetchMock.mockResolvedValueOnce(reply({ success: false, error: { code: 'QUOTA_EXCEEDED' } }, 429));

    const res = await recognize(app, user.token, 'quartz').expect(200);
    expect(warn).toHaveBeenCalled();

    expect(res.body.data.provider_used).toBe('heuristic');
    expect(res.body.data.primary_specimen.id).toBe('quartz');

    const stored = await Analysis.findByPk(res.body.data.analysis_id);
    expect(stored.raw_ai_response.provider_attempts).toEqual([
      { provider: 'geodex', available: false, reason: 'GeoDex returned HTTP 429 (QUOTA_EXCEEDED)' }
    ]);
  });

  test('once the quota is used up the next recognitions do not reach GeoDex at all', async () => {
    jest.spyOn(logger, 'warn').mockImplementation(() => {});
    fetchMock.mockResolvedValueOnce(reply({ success: false, error: { code: 'QUOTA_EXCEEDED' } }, 429));
    await recognize(app, user.token, 'quartz').expect(200);

    const res = await recognize(app, user.token, 'pyrite').expect(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res.body.data.provider_used).toBe('heuristic');

    const stored = await Analysis.findByPk(res.body.data.analysis_id);
    expect(stored.raw_ai_response.provider_attempts).toEqual([
      { provider: 'geodex', available: false, reason: expect.stringMatching(/^GeoDex paused until .* after HTTP 429 \(QUOTA_EXCEEDED\)$/) }
    ]);
  });

  test('a photo that is not a rock is rejected before GeoDex is ever called', async () => {
    await request(app)
      .post('/analysis')
      .set(auth(user.token))
      .attach('image', makeImage(600), 'selfie.jpg')
      .expect(422);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
