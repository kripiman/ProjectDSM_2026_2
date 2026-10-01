const fs = require('fs');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const env = require('../src/config/env');
const { User, Analysis, CollectionItem, UserAchievement } = require('../src/models');
const { generateToken } = require('../src/services/token.service');
const {
  createApp,
  auth,
  createGuest,
  registerUser,
  recognize,
  makeImage,
  uniqueEmail,
  TEST_PASSWORD
} = require('./helpers');

const app = createApp();


const listStoredImages = () => fs.readdirSync(env.UPLOAD_DIR);

describe('Guest recognition limit', () => {
  let guest;

  beforeAll(async () => {
    guest = await createGuest(app);
  });

  test('a guest can recognise up to 10 times and is asked to register on the 11th', async () => {
    for (let attempt = 1; attempt <= 10; attempt += 1) {
      const res = await recognize(app, guest.token, 'quartz').expect(200);
      expect(res.body.data.guest_quota).toEqual({ limit: 10, used: attempt, remaining: 10 - attempt });
    }

    const imagesBefore = listStoredImages().length;

    const blocked = await recognize(app, guest.token, 'quartz').expect(403);
    expect(blocked.body.errorCode).toBe('GUEST_LIMIT_REACHED');
    expect(blocked.body.details).toMatchObject({ limit: 10, used: 10, remaining: 0, registration_required: true });

    // The limit is enforced before the upload: nothing was stored for the rejected request.
    expect(listStoredImages()).toHaveLength(imagesBefore);
    expect(await Analysis.count({ where: { user_id: guest.user.id } })).toBe(10);
  });

  test('the limit does not apply to registered users', async () => {
    const registered = await registerUser(app);
    for (let attempt = 0; attempt < 12; attempt += 1) {
      await recognize(app, registered.token, 'quartz').expect(200);
    }
    expect(await Analysis.count({ where: { user_id: registered.user.id } })).toBe(12);
  });

  test('images rejected as non-specimens do not use up the quota', async () => {
    const fresh = await createGuest(app);
    await request(app)
      .post('/analysis')
      .set(auth(fresh.token))
      .attach('image', makeImage(500), 'not_a_rock.jpg')
      .expect(422);

    const progress = await request(app).get('/collection/progress').set(auth(fresh.token)).expect(200);
    expect(progress.body.data.guest_quota).toEqual({ limit: 10, used: 0, remaining: 10 });
  });

  test('parallel recognitions from one session can never exceed the limit', async () => {
    const racer = await createGuest(app);
    const results = await Promise.all(
      Array.from({ length: 13 }, () => recognize(app, racer.token, 'quartz'))
    );

    const succeeded = results.filter((res) => res.status === 200);
    const limited = results.filter((res) => res.status === 403);
    expect(succeeded).toHaveLength(10);
    expect(limited).toHaveLength(3);
    limited.forEach((res) => expect(res.body.errorCode).toBe('GUEST_LIMIT_REACHED'));
    expect(await Analysis.count({ where: { user_id: racer.user.id } })).toBe(10);
  });
});

describe('Guest achievements and progress', () => {
  test('a guest earns achievements during the temporary session', async () => {
    const guest = await createGuest(app);
    const res = await recognize(app, guest.token, 'quartz').expect(200);

    expect(res.body.data.unlocked_achievements.map((a) => a.code)).toContain('FIRST_SCAN');

    const achievements = await request(app).get('/achievement').set(auth(guest.token)).expect(200);
    const firstScan = achievements.body.data.find((a) => a.code === 'FIRST_SCAN');
    expect(firstScan.is_unlocked).toBe(true);
    expect(firstScan.unlocked_at).not.toBeNull();
  });
});

describe('Guest session migration', () => {
  let guest;
  let registration;
  const email = uniqueEmail('migrated');

  beforeAll(async () => {
    guest = await createGuest(app);
    await recognize(app, guest.token, 'quartz').expect(200);
    await recognize(app, guest.token, 'pyrite').expect(200);
  });

  test('registering with the guest token keeps the discoveries and achievements', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email, password: TEST_PASSWORD, guest_token: guest.token })
      .expect(201);

    registration = res.body.data;
    expect(registration.guest_migrated).toBe(true);
    expect(registration.user.id).toBe(guest.user.id);
    expect(registration.user.is_anonymous).toBe(false);
    expect(registration.user.role).toBe('user');

    const collection = await request(app).get('/collection').set(auth(registration.token)).expect(200);
    expect(collection.body.data.map((item) => item.specimen_id).sort()).toEqual(['pyrite', 'quartz']);

    const achievements = await request(app).get('/achievement?status=unlocked').set(auth(registration.token)).expect(200);
    expect(achievements.body.data.map((a) => a.code)).toContain('FIRST_SCAN');
  });

  test('the old guest token stops working once its data has been transferred', async () => {
    const stale = await request(app).get('/collection').set(auth(guest.token)).expect(401);
    expect(stale.body.message).toMatch(/no longer valid/);

    await recognize(app, guest.token, 'quartz').expect(401);
    await request(app).get('/user/profile').set(auth(guest.token)).expect(401);
  });

  test('a guest session cannot be transferred to a second account', async () => {
    const second = await request(app)
      .post('/auth/register')
      .send({ email: uniqueEmail('second'), password: TEST_PASSWORD, guest_token: guest.token })
      .expect(201);

    expect(second.body.data.guest_migrated).toBe(false);
    expect(second.body.data.user.id).not.toBe(guest.user.id);

    const collection = await request(app).get('/collection').set(auth(second.body.data.token)).expect(200);
    expect(collection.body.data).toHaveLength(0);

    // The first account keeps everything.
    expect(await CollectionItem.count({ where: { user_id: guest.user.id } })).toBe(2);
  });

  test('two simultaneous registrations cannot both claim the same guest session', async () => {
    const contested = await createGuest(app);
    await recognize(app, contested.token, 'quartz').expect(200);

    const responses = await Promise.all([
      request(app).post('/auth/register').send({ email: uniqueEmail('race_a'), password: TEST_PASSWORD, guest_token: contested.token }),
      request(app).post('/auth/register').send({ email: uniqueEmail('race_b'), password: TEST_PASSWORD, guest_token: contested.token })
    ]);

    expect(responses.map((res) => res.status)).toEqual([201, 201]);
    const migrated = responses.filter((res) => res.body.data.guest_migrated);
    expect(migrated).toHaveLength(1);
    expect(migrated[0].body.data.user.id).toBe(contested.user.id);
  });

  test('the new session token works and the migrated account can log in', async () => {
    await request(app).get('/user/profile').set(auth(registration.token)).expect(200);

    const login = await request(app).post('/auth/login').send({ email, password: TEST_PASSWORD }).expect(200);
    expect(login.body.data.user.id).toBe(guest.user.id);
    await request(app).get('/collection').set(auth(login.body.data.token)).expect(200);
  });

  test('a token that claims to be a guest is refused once the account is registered', async () => {
    // Same user, same token version: only the "guest" claim is wrong.
    const dbUser = await User.findByPk(guest.user.id);
    const forged = generateToken(dbUser.id, dbUser.role, true, dbUser.token_version);
    await request(app).get('/collection').set(auth(forged)).expect(401);
  });

  test('an unrelated or expired guest token just registers a fresh account', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: uniqueEmail('fresh'), password: TEST_PASSWORD, guest_token: 'not-a-token' })
      .expect(201);
    expect(res.body.data.guest_migrated).toBe(false);
  });

  test('guest data remains in the database for the account', async () => {
    expect(await UserAchievement.count({ where: { user_id: guest.user.id, is_unlocked: true } })).toBeGreaterThanOrEqual(1);
  });
});

describe('Guest tokens issued before token versions existed', () => {
  // Sessions created by earlier releases have no "tokenVersion" claim: they count as version 1.
  const legacyToken = (user) => jwt.sign(
    { userId: user.id, role: 'guest', isAnonymous: true },
    env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '30d' }
  );

  test('keep working and can still be migrated into an account', async () => {
    const guest = await createGuest(app);
    await recognize(app, guest.token, 'quartz').expect(200);

    const token = legacyToken(guest.user);
    expect(jwt.decode(token).tokenVersion).toBeUndefined();
    await request(app).get('/collection').set(auth(token)).expect(200);

    const res = await request(app)
      .post('/auth/register')
      .send({ email: uniqueEmail('legacy'), password: TEST_PASSWORD, guest_token: token })
      .expect(201);
    expect(res.body.data.guest_migrated).toBe(true);
    expect(res.body.data.user.id).toBe(guest.user.id);

    // Like any other guest token, it stops working once the session has been migrated.
    await request(app).get('/collection').set(auth(token)).expect(401);
    expect(await CollectionItem.count({ where: { user_id: guest.user.id } })).toBe(1);
  });

  test('are revoked like any other token when the session version changes', async () => {
    const registered = await registerUser(app);
    const legacy = jwt.sign(
      { userId: registered.user.id, role: 'user', isAnonymous: false },
      env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h' }
    );
    await request(app).get('/user/profile').set(auth(legacy)).expect(200);

    await User.update({ token_version: 2 }, { where: { id: registered.user.id } });
    await request(app).get('/user/profile').set(auth(legacy)).expect(401);
  });
});
