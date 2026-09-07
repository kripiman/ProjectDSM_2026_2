const request = require('supertest');
const Server = require('../src/utils/server');

const server = new Server();
const app = server.app;

describe('Collection & Gamification Progress APIs (HU-07, HU-11, HU-12, HU-13, HU-14)', () => {
  let authToken = '';
  let collectionItemId = '';

  beforeAll(async () => {
    const res = await request(app).post('/auth/anonymous');
    authToken = res.body.data.token;
  });

  test('POST /collection - Should add a discovered specimen to personal collection (HU-07)', async () => {
    const res = await request(app)
      .post('/collection')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        specimen_id: 'quartz',
        notes: 'Encontrado cerca de la quebrada',
        is_favorite: true
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.is_new_discovery).toBe(true);
    expect(res.body.data.collection_item.specimen_id).toBe('quartz');
    expect(res.body.data.collection_item.is_favorite).toBe(true);

    collectionItemId = res.body.data.collection_item.id;
  });

  test('GET /collection - Should retrieve user collection', async () => {
    const res = await request(app)
      .get('/collection')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data[0].specimen.id).toBe('quartz');
  });

  test('GET /collection?include_locked=true - Should return discovered and locked items (HU-12)', async () => {
    const res = await request(app)
      .get('/collection?include_locked=true')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(12);
    const quartz = res.body.data.find(s => s.specimen_id === 'quartz');
    const obsidian = res.body.data.find(s => s.specimen_id === 'obsidian');

    expect(quartz.is_discovered).toBe(true);
    expect(obsidian.is_discovered).toBe(false); // locked
  });

  test('GET /collection/progress - Should calculate category breakdown progress (HU-13)', async () => {
    const res = await request(app)
      .get('/collection/progress')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.total_specimens).toBeGreaterThanOrEqual(12);
    expect(res.body.data.total_discovered).toBe(1);
    expect(res.body.data.categories.mineral.discovered).toBe(1);
    expect(res.body.data.categories.igneous_rock.discovered).toBe(0);
  });

  test('GET /achievement - Should list achievements and user progress (HU-14)', async () => {
    const res = await request(app)
      .get('/achievement')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(3);
  });

  test('DELETE /collection/:id - Should remove an item from collection', async () => {
    const res = await request(app)
      .delete(`/collection/${collectionItemId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
  });
});
