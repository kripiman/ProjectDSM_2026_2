const request = require('supertest');
const Server = require('../src/utils/server');

const server = new Server();
const app = server.app;

describe('Activity & Telemetry Events API (HT-04)', () => {
  let authToken = '';

  beforeAll(async () => {
    const res = await request(app).post('/api/v1/auth/anonymous');
    authToken = res.body.data.token;
  });

  test('POST /api/v1/event - Should record user activity telemetry', async () => {
    const res = await request(app)
      .post('/api/v1/event')
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
  });
});
