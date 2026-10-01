const http = require('http');
const request = require('supertest');
const { Specimen, Feedback } = require('../src/models');
const { createApp, auth, registerUser, createGuest, createAdmin } = require('./helpers');

const app = createApp();

describe('Request bodies', () => {
  let user;

  beforeAll(async () => {
    user = await registerUser(app);
  });

  test('endpoints that read the body answer 400 (not 500) when none is sent', async () => {
    const guest = await createGuest(app);
    const calls = [
      request(app).post('/event').set(auth(user.token)),
      request(app).post('/auth/login'),
      request(app).post('/auth/register'),
      request(app).post('/quiz/geology_basics_101/submit').set(auth(user.token)),
      request(app).post('/analysis/some-id/refine').set(auth(user.token)),
      request(app).post('/feedback/analysis/some-id').set(auth(user.token)),
      request(app).post('/category').set(auth((await createAdmin()).token)),
      request(app).patch('/user/profile').set(auth(guest.token))
    ];

    for (const call of calls) {
      const res = await call;
      expect([res.status, res.body.errorCode]).toEqual([expect.any(Number), expect.any(String)]);
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    }
  });

  test('a body sent with the wrong content type is treated as empty', async () => {
    const res = await request(app)
      .post('/event')
      .set(auth(user.token))
      .set('Content-Type', 'text/plain')
      .send('event_type=click');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/event_type is required/);
  });

  test('malformed JSON is a client error with a clear message', async () => {
    const res = await request(app)
      .post('/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": "a@b.cl", ');

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/malformed JSON/i);
  });

  test('oversized bodies are refused', async () => {
    const res = await request(app)
      .post('/event')
      .set(auth(user.token))
      .send({ event_type: 'x', payload: { blob: 'a'.repeat(200 * 1024) } });
    expect(res.status).toBe(413);
  });

  test('NUL characters are refused wherever they appear in a JSON body', async () => {
    for (const payload of [
      { event_type: 'a\u0000b' },
      { event_type: 'ok', payload: { nested: ['x', { deep: 'y\u0000' }] } },
      { event_type: 'ok', payload: { 'bad\u0000key': 1 } }
    ]) {
      const res = await request(app).post('/event').set(auth(user.token)).send(payload).expect(400);
      expect(res.body.message).toMatch(/invalid characters/);
    }
    await request(app).post('/event').set(auth(user.token)).send({ event_type: 'fine', payload: { ok: true } }).expect(201);
  });

  test('PUT /user/preferences accepts an empty update and rejects wrong types', async () => {
    await request(app).put('/user/preferences').set(auth(user.token)).expect(200);
    await request(app).put('/user/preferences').set(auth(user.token)).send({ theme: 'neon' }).expect(400);
    await request(app).put('/user/preferences').set(auth(user.token)).send({ reduce_animations: 'yes' }).expect(400);
  });
});

describe('Error handling', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('database failures are reported as a generic 500 without internal details', async () => {
    jest.spyOn(Specimen, 'findAndCountAll').mockRejectedValueOnce(
      Object.assign(new Error('SQLITE_ERROR: no such column: secret_table.password'), { name: 'SequelizeDatabaseError', sql: 'SELECT secret FROM x' })
    );

    const res = await request(app).get('/rock').expect(500);
    expect(res.body).toMatchObject({ success: false, statusCode: 500, errorCode: '500_INTERNAL_SERVER_ERROR', message: 'Internal server error' });
    expect(JSON.stringify(res.body)).not.toMatch(/sqlite|secret|password|select/i);
    expect(res.body.details).toBeNull();
  });

  test('unexpected programming errors are also generic', async () => {
    jest.spyOn(Specimen, 'findAndCountAll').mockRejectedValueOnce(new TypeError("Cannot read properties of undefined (reading 'secret')"));

    const res = await request(app).get('/rock').expect(500);
    expect(res.body.message).toBe('Internal server error');
    expect(JSON.stringify(res.body)).not.toMatch(/secret|undefined/);
  });

  test('constraint violations are conflicts (409), not server errors', async () => {
    jest.spyOn(Specimen, 'findAndCountAll').mockRejectedValueOnce(
      Object.assign(new Error('FOREIGN KEY constraint failed'), { name: 'SequelizeForeignKeyConstraintError' })
    );
    const fk = await request(app).get('/rock').expect(409);
    expect(fk.body.errorCode).toBe('409_CONFLICT');
    expect(JSON.stringify(fk.body)).not.toMatch(/FOREIGN KEY constraint failed/);

    // A real unique violation: two feedback entries for one recognition.
    const owner = await registerUser(app);
    const { recognize } = require('./helpers');
    const recognition = await recognize(app, owner.token, 'quartz').expect(200);
    const duplicate = await Feedback.create({ id: 'fb-1', analysis_id: recognition.body.data.analysis_id, user_id: owner.user.id, rating: 'correct' });
    expect(duplicate.id).toBe('fb-1');
    await expect(
      Feedback.create({ id: 'fb-2', analysis_id: recognition.body.data.analysis_id, user_id: owner.user.id, rating: 'incorrect' })
    ).rejects.toMatchObject({ name: 'SequelizeUniqueConstraintError' });
  });

  test('unknown routes answer with a JSON 404', async () => {
    const res = await request(app).get('/nothing/here').expect(404);
    expect(res.body).toMatchObject({ success: false, statusCode: 404, errorCode: '404_NOT_FOUND' });
    expect(res.body.message).toMatch(/GET \/nothing\/here/);
  });

  test('client errors keep their messages', async () => {
    const res = await request(app).post('/auth/login').send({ email: 'not-an-email', password: 'x' }).expect(400);
    expect(res.body.message).toMatch(/Invalid email address/);
    expect(res.body.message).toMatch(/email/);
  });
});

describe('HTTP hardening', () => {
  test('the server does not announce its framework', async () => {
    const res = await request(app).get('/health').expect(200);
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  test('cross-origin clients are allowed (CORS)', async () => {
    const res = await request(app).get('/health').set('Origin', 'https://app.example.com').expect(200);
    expect(res.headers['access-control-allow-origin']).toBeDefined();
  });

  // Requests are written to the socket as they are: supertest (like most clients)
  // normalizes "/uploads/../.env" to "/.env" before sending it, which would make the
  // test meaningless.
  const rawGet = (port, rawPath) => new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method: 'GET', path: rawPath }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.end();
  });

  test('the uploads folder cannot be traversed or listed', async () => {
    const server = await new Promise((resolve) => { const instance = app.listen(0, () => resolve(instance)); });
    try {
      const { port } = server.address();
      const paths = [
        '/uploads/../.env',
        '/uploads/%2e%2e/.env',
        '/uploads/..%2f.env',
        '/uploads/%2e%2e%2f.env',
        '/uploads/analyses/../../.env',
        '/uploads/analyses/..%2f..%2f.env',
        '/uploads/specimens/%2e%2e%2f%2e%2e%2fpackage.json',
        '/uploads/',
        '/uploads/analyses/',
        '/uploads/.env'
      ];

      for (const rawPath of paths) {
        const res = await rawGet(port, rawPath);
        expect([rawPath, [403, 404].includes(res.status)]).toEqual([rawPath, true]);
        expect(res.body).not.toMatch(/JWT_SECRET|"dependencies"/);
      }
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test('health check works without authentication', async () => {
    const res = await request(app).get('/health').expect(200);
    expect(res.body.data.status).toBe('UP');
  });
});

describe('Sensitive data', () => {
  test('no response ever includes password hashes', async () => {
    const admin = await createAdmin();
    const user = await registerUser(app);
    const guest = await createGuest(app);

    const responses = [
      await request(app).post('/auth/login').send({ email: user.email, password: user.password }),
      await request(app).get('/user/profile').set(auth(user.token)),
      await request(app).get('/admin/users?is_anonymous=all').set(auth(admin.token)),
      await request(app).get(`/admin/users/${user.user.id}`).set(auth(admin.token)),
      await request(app).get('/admin/history').set(auth(admin.token)),
      await request(app).get('/admin/feedback').set(auth(admin.token)),
      await request(app).get('/collection/progress').set(auth(guest.token))
    ];

    for (const res of responses) {
      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).not.toMatch(/password|\$2[aby]\$/i);
    }
  });
});
