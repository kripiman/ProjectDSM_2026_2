const request = require('supertest');
const Server = require('../src/utils/server');

const server = new Server();
const app = server.app;

describe('Authentication & User Management APIs (HU-01, HU-02, HU-11, HU-15, HU-17)', () => {
  let guestToken = '';
  let guestUserId = '';
  let registeredToken = '';

  test('POST /api/v1/auth/anonymous - Should create an anonymous guest session', async () => {
    const res = await request(app)
      .post('/api/v1/auth/anonymous')
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.user.is_anonymous).toBe(true);
    expect(res.body.data.user.role).toBe('guest');

    guestToken = res.body.data.token;
    guestUserId = res.body.data.user.id;
  });

  test('POST /api/v1/auth/register - Should register account and migrate guest session', async () => {
    const email = `testuser_${Date.now()}@example.com`;
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email,
        password: 'Password123!',
        display_name: 'Geólogo Experto',
        guest_token: guestToken
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.user.email).toBe(email);
    expect(res.body.data.user.is_anonymous).toBe(false);
    expect(res.body.data.user.id).toBe(guestUserId); // migrated

    registeredToken = res.body.data.token;
  });

  test('POST /api/v1/auth/login - Should authenticate existing registered user', async () => {
    // Register another user
    const email = `login_test_${Date.now()}@example.com`;
    await request(app)
      .post('/api/v1/auth/register')
      .send({
        email,
        password: 'SecurePassword123!'
      })
      .expect(201);

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email,
        password: 'SecurePassword123!'
      })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.user.email).toBe(email);
  });

  test('GET /api/v1/user/preferences - Should retrieve user preferences', async () => {
    const res = await request(app)
      .get('/api/v1/user/preferences')
      .set('Authorization', `Bearer ${registeredToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.language).toBe('es');
    expect(res.body.data.theme).toBe('system');
  });

  test('PUT /api/v1/user/preferences - Should update user preferences (HU-15)', async () => {
    const res = await request(app)
      .put('/api/v1/user/preferences')
      .set('Authorization', `Bearer ${registeredToken}`)
      .send({
        theme: 'dark',
        reduce_animations: true,
        language: 'en'
      })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.theme).toBe('dark');
    expect(res.body.data.reduce_animations).toBe(true);
    expect(res.body.data.language).toBe('en');
  });

  test('DELETE /api/v1/auth/account - Should soft delete user account (HU-17)', async () => {
    const res = await request(app)
      .delete('/api/v1/auth/account')
      .set('Authorization', `Bearer ${registeredToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
  });
});
