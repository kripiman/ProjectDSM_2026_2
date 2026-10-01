const request = require('supertest');

const { createApp } = require('./helpers');

const app = createApp();

describe('Catalog & Taxonomy APIs (HU-08, HU-09, HU-10, HU-13)', () => {
  test('GET /specimen - Should list specimens with pagination', async () => {
    const res = await request(app)
      .get('/specimen?page=1&limit=5')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.specimens.length).toBeLessThanOrEqual(5);
    expect(res.body.data.total).toBeGreaterThanOrEqual(12);
    expect(res.body.data).toMatchObject({ page: 1, limit: 5 });
    expect(res.body.data.total_pages).toBe(Math.ceil(res.body.data.total / 5));
  });

  test('GET /specimen - is public and lists each specimen with its category and type', async () => {
    const res = await request(app).get('/specimen?limit=100').expect(200);

    const quartz = res.body.data.specimens.find((s) => s.id === 'quartz');
    expect(quartz.category_rel).toMatchObject({ id: 1, name: 'mineral' });
    expect(quartz.type_rel).toMatchObject({ id: 1, name: 'silicato' });
  });

  test('GET /specimen?category=mineral - Should filter by category', async () => {
    const res = await request(app)
      .get('/specimen?category=mineral')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.specimens).toHaveLength(5);
    res.body.data.specimens.forEach((s) => {
      expect(s.category).toBe('mineral');
    });
  });

  test('GET /specimen - Should filter by category id and by type', async () => {
    const byId = await request(app).get('/specimen?category_id=3').expect(200);
    expect(byId.body.data.specimens.map((s) => s.id).sort()).toEqual(['limestone', 'sandstone']);

    const byType = await request(app).get('/specimen?type=sulfuro').expect(200);
    expect(byType.body.data.specimens.map((s) => s.id)).toEqual(['pyrite']);

    const combined = await request(app).get('/specimen?category_id=1&type_id=1').expect(200);
    expect(combined.body.data.specimens.map((s) => s.id).sort()).toEqual(['feldspar', 'quartz']);
  });

  test('GET /specimen - Should filter by rarity and magnetism', async () => {
    const rare = await request(app).get('/specimen?rarity=uncommon').expect(200);
    expect(rare.body.data.specimens.map((s) => s.id).sort()).toEqual(['magnetite', 'obsidian']);

    const magnetic = await request(app).get('/specimen?magnetism=true').expect(200);
    expect(magnetic.body.data.specimens.map((s) => s.id)).toEqual(['magnetite']);
  });

  test('GET /specimen?q=Cuarzo - Should search by keyword', async () => {
    const res = await request(app)
      .get('/specimen?q=Cuarzo')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.specimens.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.specimens[0].id).toBe('quartz');
  });

  test('GET /specimen - invalid parameters are client errors, not server errors', async () => {
    for (const query of ['limit=abc', 'page=0', 'limit=-3', 'limit=0', 'category_id=abc', 'rarity=mythic', 'magnetism=perhaps']) {
      const res = await request(app).get(`/specimen?${query}`).expect(400);
      expect(res.body.errorCode).toBe('400_VALIDATION_ERROR');
    }
  });

  test('GET /specimen - a page size above the maximum is reduced to it', async () => {
    const res = await request(app).get('/specimen?limit=1000').expect(200);
    expect(res.body.data.limit).toBe(100);
    expect(res.body.data.total_pages).toBe(Math.ceil(res.body.data.total / 100));
  });

  test('GET /specimen/:id - Should retrieve full profile with Mohs and tips (HU-10)', async () => {
    const res = await request(app)
      .get('/specimen/pyrite')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe('pyrite');
    expect(res.body.data.mohs_hardness_min).toBe(6.0);
    expect(res.body.data.luster).toBe('Metálico brillante');
    expect(res.body.data.identification_tips).toBeDefined();
    expect(res.body.data.type_rel.name).toBe('sulfuro');

    await request(app).get('/specimen/unobtainium').expect(404);
  });

  test('GET /specimen/categories - Should retrieve category breakdown (HU-13)', async () => {
    const res = await request(app)
      .get('/specimen/categories')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.some(c => c.category === 'mineral')).toBe(true);
    expect(res.body.data.some(c => c.category === 'igneous_rock')).toBe(true);

    const mineral = res.body.data.find((c) => c.category === 'mineral');
    expect(mineral).toMatchObject({ category_id: 1, total_specimens: 5 });
  });

  test('the plural alias /specimens serves the same catalog', async () => {
    const res = await request(app).get('/specimens?category=igneous_rock').expect(200);
    expect(res.body.data.specimens.map((s) => s.id).sort()).toEqual(['basalt', 'granite', 'obsidian']);
  });
});
