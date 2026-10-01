const request = require('supertest');
const jwt = require('jsonwebtoken');
const env = require('../src/config/env');
const { User, Analysis } = require('../src/models');
const { createApp, auth, registerUser, createAdmin, recognize, uniqueEmail, TEST_PASSWORD } = require('./helpers');

const app = createApp();

describe('Authentication & User Management APIs (HU-01, HU-02, HU-11, HU-15, HU-17)', () => {
  let guestToken = '';
  let guestUserId = '';
  let registeredToken = '';
  let registeredEmail = '';

  test('POST /auth/anonymous - Should create an anonymous guest session', async () => {
    const res = await request(app)
      .post('/auth/anonymous')
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.user.is_anonymous).toBe(true);
    expect(res.body.data.user.role).toBe('guest');

    guestToken = res.body.data.token;
    guestUserId = res.body.data.user.id;
  });

  test('POST /auth/register - Should register account and migrate guest session', async () => {
    const email = `testuser_${Date.now()}@example.com`;
    const res = await request(app)
      .post('/auth/register')
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
    registeredEmail = email;
  });

  test('POST /auth/login - Should authenticate existing registered user', async () => {
    // Register another user
    const email = `login_test_${Date.now()}@example.com`;
    await request(app)
      .post('/auth/register')
      .send({
        email,
        password: 'SecurePassword123!'
      })
      .expect(201);

    const res = await request(app)
      .post('/auth/login')
      .send({
        email,
        password: 'SecurePassword123!'
      })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.user.email).toBe(email);
  });

  test('GET /user/preferences - Should retrieve user preferences', async () => {
    const res = await request(app)
      .get('/user/preferences')
      .set('Authorization', `Bearer ${registeredToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.language).toBe('es');
    expect(res.body.data.theme).toBe('system');
  });

  test('PUT /user/preferences - Should update user preferences (HU-15)', async () => {
    const res = await request(app)
      .put('/user/preferences')
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

  test('DELETE /auth/account - Should soft delete user account (HU-17)', async () => {
    const res = await request(app)
      .delete('/auth/account')
      .set('Authorization', `Bearer ${registeredToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);

    // The session of a deleted account is no longer accepted, and the soft delete is complete.
    await request(app).get('/user/profile').set(auth(registeredToken)).expect(401);
    const record = await User.scope('withPassword').findByPk(guestUserId, { paranoid: false });
    expect(record.is_deleted).toBe(true);
    expect(record.deleted_at).not.toBeNull();

    // Personal data is erased, not just hidden.
    expect([record.email, record.userName, record.phone, record.password_hash, record.display_name, record.avatar_url])
      .toEqual([null, null, null, null, null, null]);
    await request(app).post('/auth/login').send({ email: registeredEmail, password: 'Password123!' }).expect(401);

    // ... and the e-mail can be registered again.
    await request(app).post('/auth/register').send({ email: registeredEmail, password: 'Password123!' }).expect(201);
  });

  test('POST /auth/register - Should register user with userName and phone matching class schema', async () => {
    const timestamp = Date.now();
    const email = `class_user_${timestamp}@example.com`;
    const userName = `rockexpert_${timestamp}`;
    const phone = `+569${timestamp.toString().slice(-8)}`;

    const res = await request(app)
      .post('/auth/register')
      .send({
        email,
        password: 'Password123!',
        userName,
        phone
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.user.userName).toBe(userName);
    expect(res.body.data.user.phone).toBe(phone);
    expect(res.body.data.user.password).toBeUndefined();
    expect(res.body.data.user.password_hash).toBeUndefined();
  });
});

describe('Registration rules', () => {
  test('nobody can obtain privileges through the registration payload', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({
        email: uniqueEmail('sneaky'),
        password: TEST_PASSWORD,
        role: 'admin',
        role_id: 3,
        status: 'active',
        is_anonymous: true,
        experience_points: 99999,
        token_version: 50
      })
      .expect(201);

    expect(res.body.data.user.role).toBe('user');
    expect(res.body.data.user.is_anonymous).toBe(false);
    expect(res.body.data.user.experience_points).toBe(0);

    const stored = await User.findByPk(res.body.data.user.id);
    expect(stored.role).toBe('user');
    expect(stored.role_id).toBe(2);
    expect(stored.token_version).toBe(1);

    await request(app).get('/admin/users').set(auth(res.body.data.token)).expect(403);
  });

  test('the role name and role_id are assigned consistently for every kind of account', async () => {
    const guest = await request(app).post('/auth/anonymous').expect(201);
    const guestRecord = await User.findByPk(guest.body.data.user.id);
    expect([guestRecord.role, guestRecord.role_id]).toEqual(['guest', 1]);

    const admin = await createAdmin();
    const adminRecord = await User.findByPk(admin.user.id);
    expect([adminRecord.role, adminRecord.role_id]).toEqual(['admin', 3]);

    // Whichever of the two is changed, the other follows (and is written to the database).
    await adminRecord.update({ role_id: 2 });
    expect(adminRecord.role).toBe('user');
    expect((await User.findByPk(admin.user.id)).role).toBe('user');

    await adminRecord.update({ role: 'admin' });
    const reloaded = await User.findByPk(admin.user.id);
    expect([reloaded.role, reloaded.role_id]).toEqual(['admin', 3]);
  });

  test('email and password are required and validated', async () => {
    const missing = await request(app).post('/auth/register').send({ email: uniqueEmail() }).expect(400);
    expect(missing.body.errorCode).toBe('400_VALIDATION_ERROR');

    await request(app).post('/auth/register').send({ email: 'not-an-email', password: TEST_PASSWORD }).expect(400);
    await request(app).post('/auth/register').send({ email: uniqueEmail(), password: '123' }).expect(400);
    await request(app).post('/auth/register').send({}).expect(400);
    await request(app).post('/auth/register').expect(400);
  });

  test('duplicated emails and user names are rejected', async () => {
    const first = await registerUser(app, { userName: `dup_${Date.now()}` });

    const sameEmail = await request(app)
      .post('/auth/register')
      .send({ email: first.email, password: TEST_PASSWORD })
      .expect(400);
    expect(sameEmail.body.message).toMatch(/already registered/);

    // Emails are case-insensitive.
    await request(app)
      .post('/auth/register')
      .send({ email: first.email.toUpperCase(), password: TEST_PASSWORD })
      .expect(400);

    await request(app)
      .post('/auth/register')
      .send({ email: uniqueEmail(), password: TEST_PASSWORD, userName: first.user.userName })
      .expect(400);
  });

  test('simultaneous registrations are all accepted (no database lock errors)', async () => {
    const responses = await Promise.all(
      Array.from({ length: 24 }, () => request(app)
        .post('/auth/register')
        .send({ email: uniqueEmail('burst'), password: TEST_PASSWORD }))
    );

    expect(responses.map((res) => res.status)).toEqual(Array(24).fill(201));
  });

  test('simultaneous registrations with the same email produce exactly one account', async () => {
    const email = uniqueEmail('samemail');
    const responses = await Promise.all(
      Array.from({ length: 5 }, () => request(app).post('/auth/register').send({ email, password: TEST_PASSWORD }))
    );

    expect(responses.filter((res) => res.status === 201)).toHaveLength(1);
    responses.filter((res) => res.status !== 201).forEach((res) => expect([400, 409]).toContain(res.status));
    expect(await User.count({ where: { email } })).toBe(1);
  });
});

describe('Login and sessions', () => {
  let account;

  beforeAll(async () => {
    account = await registerUser(app);
  });

  test('passwords are stored hashed and never returned', async () => {
    const stored = await User.scope('withPassword').findOne({ where: { email: account.email } });
    expect(stored.password_hash).toBeTruthy();
    expect(stored.password_hash).not.toBe(account.password);
    expect(stored.password_hash).toMatch(/^\$2[aby]\$/);

    const login = await request(app).post('/auth/login').send({ email: account.email, password: account.password }).expect(200);
    expect(JSON.stringify(login.body)).not.toMatch(/password/i);

    const profile = await request(app).get('/user/profile').set(auth(account.token)).expect(200);
    expect(JSON.stringify(profile.body)).not.toMatch(/password/i);
  });

  test('the password hash is excluded from every default query, even nested ones', async () => {
    const plain = await User.findByPk(account.user.id);
    expect(plain.password_hash).toBeUndefined();
    expect(plain.toJSON().password_hash).toBeUndefined();

    // A user nested inside another record (as in the administration listings) is covered too.
    await recognize(app, account.token, 'quartz').expect(200);
    const nested = await Analysis.findOne({ where: { user_id: account.user.id }, include: [{ model: User, as: 'user' }] });
    expect(nested).not.toBeNull();
    expect(nested.user.email).toBe(account.email);
    expect(nested.get({ plain: true }).user.password_hash).toBeUndefined();
    expect(JSON.parse(JSON.stringify(nested)).user.password_hash).toBeUndefined();
  });

  test('wrong credentials are rejected with the same message', async () => {
    const wrongPassword = await request(app).post('/auth/login').send({ email: account.email, password: 'wrong-password' }).expect(401);
    const unknownEmail = await request(app).post('/auth/login').send({ email: uniqueEmail('ghost'), password: TEST_PASSWORD }).expect(401);
    expect(wrongPassword.body.message).toBe(unknownEmail.body.message);

    await request(app).post('/auth/login').send({ email: account.email }).expect(400);
  });

  test('login is case-insensitive on the email', async () => {
    await request(app).post('/auth/login').send({ email: account.email.toUpperCase(), password: account.password }).expect(200);
  });

  test('protected routes reject missing, malformed, forged and expired tokens', async () => {
    await request(app).get('/user/profile').expect(401);
    await request(app).get('/user/profile').set('Authorization', 'Bearer not.a.jwt').expect(401);
    await request(app).get('/user/profile').set('Authorization', `Basic ${account.token}`).expect(401);

    const forged = jwt.sign({ userId: account.user.id, role: 'admin', isAnonymous: false, tokenVersion: 1 }, 'some-other-secret');
    await request(app).get('/user/profile').set(auth(forged)).expect(401);

    const expired = jwt.sign(
      { userId: account.user.id, role: 'user', isAnonymous: false, tokenVersion: 1 },
      env.JWT_SECRET,
      { expiresIn: -10 }
    );
    await request(app).get('/user/profile').set(auth(expired)).expect(401);
  });

  test('the role claim inside a token is not trusted: permissions come from the database', async () => {
    const claimsAdmin = jwt.sign(
      { userId: account.user.id, role: 'admin', isAnonymous: false, tokenVersion: 1 },
      env.JWT_SECRET
    );
    await request(app).get('/admin/stats').set(auth(claimsAdmin)).expect(403);
  });

  test('tokens issued before sessions were versioned are read as version 1 and end with the session', async () => {
    const legacy = jwt.sign({ userId: account.user.id, role: 'user', isAnonymous: false }, env.JWT_SECRET);
    await request(app).get('/user/profile').set(auth(legacy)).expect(200);

    await User.update({ token_version: 2 }, { where: { id: account.user.id } });
    await request(app).get('/user/profile').set(auth(legacy)).expect(401);
    await User.update({ token_version: 1 }, { where: { id: account.user.id } });
  });

  test('optional authentication forgives unusable tokens but not server failures', async () => {
    await request(app).post('/event').set('Authorization', 'Bearer garbage').send({ event_type: 'app_opened' }).expect(201);

    const failing = jest.spyOn(User, 'findByPk').mockRejectedValueOnce(new Error('database unavailable'));
    const res = await request(app).post('/event').set(auth(account.token)).send({ event_type: 'app_opened' });
    failing.mockRestore();

    expect(res.status).toBe(500);
    expect(res.body.message).toBe('Internal server error');
  });
});

describe('Account status', () => {
  test('a suspended account loses its sessions and cannot log in, and reactivating it does not revive them', async () => {
    const account = await registerUser(app);
    const admin = await createAdmin();
    await request(app).get('/user/profile').set(auth(account.token)).expect(200);

    await request(app)
      .patch(`/admin/users/${account.user.id}/status`)
      .set(auth(admin.token))
      .send({ status: 'suspended' })
      .expect(200);

    const blockedLogin = await request(app).post('/auth/login').send({ email: account.email, password: account.password }).expect(403);
    expect(blockedLogin.body.message).toMatch(/suspended/);
    const blockedSession = await request(app).get('/user/profile').set(auth(account.token)).expect(401);
    expect(blockedSession.body.message).toMatch(/no longer valid/);

    await request(app)
      .patch(`/admin/users/${account.user.id}/status`)
      .set(auth(admin.token))
      .send({ status: 'active' })
      .expect(200);

    // The token from before the suspension stays dead; signing in again issues a new one.
    await request(app).get('/user/profile').set(auth(account.token)).expect(401);
    const login = await request(app).post('/auth/login').send({ email: account.email, password: account.password }).expect(200);
    await request(app).get('/user/profile').set(auth(login.body.data.token)).expect(200);
  });

  test('a blocked account whose session is still current is refused with 403', async () => {
    const account = await registerUser(app);
    // Status changed directly in the database, without ending the session.
    await User.update({ status: 'suspended' }, { where: { id: account.user.id } });

    const res = await request(app).get('/user/profile').set(auth(account.token)).expect(403);
    expect(res.body.message).toMatch(/suspended/);
    await User.update({ status: 'active' }, { where: { id: account.user.id } });
  });
});

describe('Profile', () => {
  test('PATCH /user/profile updates personal details only', async () => {
    const account = await registerUser(app);

    const res = await request(app)
      .patch('/user/profile')
      .set(auth(account.token))
      .send({
        display_name: 'Nuevo Nombre',
        avatar_url: 'https://example.com/me.png',
        role: 'admin',
        role_id: 3,
        status: 'banned',
        is_anonymous: true,
        experience_points: 5000
      })
      .expect(200);

    expect(res.body.data.display_name).toBe('Nuevo Nombre');
    expect(res.body.data.avatar_url).toBe('https://example.com/me.png');
    expect(res.body.data.role).toBe('user');

    const stored = await User.findByPk(account.user.id);
    expect(stored.role).toBe('user');
    expect(stored.status).toBe('active');
    expect(stored.is_anonymous).toBe(false);
    expect(stored.experience_points).toBe(0);
    await request(app).get('/admin/stats').set(auth(account.token)).expect(403);

    // Nothing updatable in the payload.
    await request(app).patch('/user/profile').set(auth(account.token)).send({ role: 'admin' }).expect(400);
    await request(app).patch('/user/profile').set(auth(account.token)).send({}).expect(400);
  });

  test('profile changes that collide with another account are refused', async () => {
    const first = await registerUser(app, { userName: `taken_${Date.now()}` });
    const second = await registerUser(app);

    const res = await request(app)
      .patch('/user/profile')
      .set(auth(second.token))
      .send({ userName: first.user.userName })
      .expect(409);
    expect(res.body.errorCode).toBe('409_CONFLICT');
  });
});

describe('Administrator account safety', () => {
  test('the last active administrator cannot delete their own account', async () => {
    const { Op } = require('sequelize');
    const admin = await createAdmin();

    // Make this administrator the only active one.
    await User.update(
      { status: 'suspended' },
      { where: { role: 'admin', id: { [Op.ne]: admin.user.id } } }
    );

    const res = await request(app).delete('/auth/account').set(auth(admin.token)).expect(409);
    expect(res.body.message).toMatch(/last active administrator/);

    await User.update({ status: 'active' }, { where: { role: 'admin' } });
  });

  test('two administrators deleting their accounts at the same time cannot leave the platform without one', async () => {
    const { Op } = require('sequelize');
    const first = await createAdmin();
    const second = await createAdmin();
    await User.update(
      { status: 'suspended' },
      { where: { role: 'admin', id: { [Op.notIn]: [first.user.id, second.user.id] } } }
    );

    const results = await Promise.all([
      request(app).delete('/auth/account').set(auth(first.token)),
      request(app).delete('/auth/account').set(auth(second.token))
    ]);

    expect(results.map((res) => res.status).sort()).toEqual([200, 409]);
    expect(await User.count({ where: { role: 'admin', status: 'active' } })).toBe(1);

    await User.update({ status: 'active' }, { where: { role: 'admin' } });
  });
});
