const request = require('supertest');
const { UserEvent } = require('../src/models');
const { createApp, auth, createGuest, registerUser } = require('./helpers');

const app = createApp();

describe('Activity & Telemetry Events API (HT-04)', () => {
  let authToken = '';
  let guest;

  beforeAll(async () => {
    guest = await createGuest(app);
    authToken = guest.token;
  });

  test('POST /event - Should record user activity telemetry', async () => {
    const res = await request(app)
      .post('/event')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        event_type: 'specimen_viewed',
        payload: {
          specimen_id: 'quartz',
          source: 'catalog_search'
        }
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.event_id).toBeDefined();

    const stored = await UserEvent.findByPk(res.body.data.event_id);
    expect(stored.user_id).toBe(guest.user.id);
    expect(stored.payload).toEqual({ specimen_id: 'quartz', source: 'catalog_search' });
  });

  test('events of registered users are linked to their account', async () => {
    const user = await registerUser(app);
    const res = await request(app).post('/event').set(auth(user.token)).send({ event_type: 'screen_opened' }).expect(201);
    expect((await UserEvent.findByPk(res.body.data.event_id)).user_id).toBe(user.user.id);
  });

  test('anonymous events (no token, or an unusable one) are recorded without a user', async () => {
    const anonymous = await request(app).post('/event').send({ event_type: 'app_opened' }).expect(201);
    expect((await UserEvent.findByPk(anonymous.body.data.event_id)).user_id).toBeNull();

    const broken = await request(app)
      .post('/event')
      .set('Authorization', 'Bearer not.a.token')
      .send({ event_type: 'app_opened' })
      .expect(201);
    expect((await UserEvent.findByPk(broken.body.data.event_id)).user_id).toBeNull();
  });

  test('the event type is required, also when the body is missing entirely', async () => {
    const empty = await request(app).post('/event').set(auth(authToken)).expect(400);
    expect(empty.body.message).toMatch(/event_type is required/);

    await request(app).post('/event').set(auth(authToken)).send({ payload: { a: 1 } }).expect(400);
  });
});
