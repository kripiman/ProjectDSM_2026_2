const request = require('supertest');
const Server = require('../src/utils/server');

const server = new Server();
const app = server.app;

describe('Catalog & Taxonomy APIs (HU-08, HU-09, HU-10, HU-13)', () => {
  test('GET /api/v1/specimen - Should list specimens with pagination', async () => {
    const res = await request(app)
      .get('/api/v1/specimen?page=1&limit=5')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.specimens.length).toBeLessThanOrEqual(5);
    expect(res.body.data.total).toBeGreaterThanOrEqual(12);
  });

  test('GET /api/v1/specimen?category=mineral - Should filter by category', async () => {
    const res = await request(app)
      .get('/api/v1/specimen?category=mineral')
      .expect(200);

    expect(res.body.success).toBe(true);
    res.body.data.specimens.forEach(s => {
      expect(s.category).toBe('mineral');
    });
  });

  test('GET /api/v1/specimen?q=Cuarzo - Should search by keyword', async () => {
    const res = await request(app)
      .get('/api/v1/specimen?q=Cuarzo')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.specimens.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.specimens[0].id).toBe('quartz');
  });

  test('GET /api/v1/specimen/:id - Should retrieve full profile with Mohs and tips (HU-10)', async () => {
    const res = await request(app)
      .get('/api/v1/specimen/pyrite')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe('pyrite');
    expect(res.body.data.mohs_hardness_min).toBe(6.0);
    expect(res.body.data.luster).toBe('Metálico brillante');
    expect(res.body.data.identification_tips).toBeDefined();
  });

  test('GET /api/v1/specimen/categories - Should retrieve category breakdown (HU-13)', async () => {
    const res = await request(app)
      .get('/api/v1/specimen/categories')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.some(c => c.category === 'mineral')).toBe(true);
    expect(res.body.data.some(c => c.category === 'igneous_rock')).toBe(true);
  });
});
