const request = require('supertest');
const { CollectionItem } = require('../src/models');
const { createApp, auth, registerUser, createGuest, recognize } = require('./helpers');

const app = createApp();

/** Recognises the given specimens, in order, as `user`. */
const discover = async (user, specimens) => {
  for (const specimen of specimens) {
    await recognize(app, user.token, specimen).expect(200);
  }
};

describe('Automatic collection', () => {
  describe('discoveries', () => {
    let user;

    beforeAll(async () => {
      user = await registerUser(app);
    });

    test('a recognition adds the specimen to the collection as a new discovery', async () => {
      const res = await recognize(app, user.token, 'quartz').expect(200);

      expect(res.body.data.primary_specimen.id).toBe('quartz');
      expect(res.body.data.discovery).toMatchObject({
        specimen_id: 'quartz',
        is_new_discovery: true,
        occurrences_count: 1,
        additional_recognitions: 0
      });

      const collection = await request(app).get('/collection').set(auth(user.token)).expect(200);
      expect(collection.body.data).toHaveLength(1);
      expect(collection.body.data[0].specimen.id).toBe('quartz');
      expect(collection.body.data[0].occurrences_count).toBe(1);
    });

    test('recognising the same specimen again increments a counter instead of duplicating it', async () => {
      const before = await request(app).get('/collection/quartz').set(auth(user.token)).expect(200);
      const firstDiscovery = before.body.data.discovered_at;

      const res = await recognize(app, user.token, 'quartz').expect(200);
      expect(res.body.data.discovery).toMatchObject({ is_new_discovery: false, occurrences_count: 2, additional_recognitions: 1 });

      await recognize(app, user.token, 'quartz').expect(200);

      const collection = await request(app).get('/collection').set(auth(user.token)).expect(200);
      expect(collection.body.data).toHaveLength(1);

      const detail = await request(app).get('/collection/quartz').set(auth(user.token)).expect(200);
      expect(detail.body.data.occurrences_count).toBe(3);
      expect(detail.body.data.additional_recognitions).toBe(2);
      // The date of the first discovery is preserved.
      expect(detail.body.data.discovered_at).toBe(firstDiscovery);
      expect(detail.body.data.specimen.id).toBe('quartz');
      expect(detail.body.data.recognitions).toHaveLength(3);
    });

    test('every specimen appears once, however many times it is recognised', async () => {
      await discover(user, ['pyrite', 'pyrite']);

      const items = await CollectionItem.findAll({ where: { user_id: user.user.id } });
      expect(items.map((item) => item.specimen_id).sort()).toEqual(['pyrite', 'quartz']);
    });

    test('each user only sees their own collection', async () => {
      const other = await registerUser(app);

      const empty = await request(app).get('/collection').set(auth(other.token)).expect(200);
      expect(empty.body.data).toHaveLength(0);
      await request(app).get('/collection/quartz').set(auth(other.token)).expect(404);

      await discover(other, ['basalt']);
      const mine = await request(app).get('/collection').set(auth(user.token)).expect(200);
      expect(mine.body.data.map((entry) => entry.specimen_id)).not.toContain('basalt');
    });
  });

  describe('a populated collection', () => {
    let user;

    beforeAll(async () => {
      user = await registerUser(app);
      await discover(user, ['quartz', 'quartz', 'quartz', 'pyrite', 'pyrite']);
    });

    test('GET /collection/:specimenId returns 404 for a specimen that was not discovered', async () => {
      const res = await request(app).get('/collection/obsidian').set(auth(user.token)).expect(404);
      expect(res.body.message).toMatch(/not been discovered/);
    });

    test('entries cannot be created or deleted by hand', async () => {
      const created = await request(app)
        .post('/collection')
        .set(auth(user.token))
        .send({ specimen_id: 'obsidian' });
      expect(created.status).toBe(404);

      const item = await CollectionItem.findOne({ where: { user_id: user.user.id } });
      const deleted = await request(app).delete(`/collection/${item.id}`).set(auth(user.token));
      expect(deleted.status).toBe(404);
      expect(await CollectionItem.count({ where: { user_id: user.user.id } })).toBe(2);

      const collection = await request(app).get('/collection').set(auth(user.token)).expect(200);
      expect(collection.body.data.map((entry) => entry.specimen_id)).not.toContain('obsidian');
    });

    test('PATCH /collection/:specimenId edits notes and favorite without touching counters', async () => {
      const res = await request(app)
        .patch('/collection/pyrite')
        .set(auth(user.token))
        .send({ notes: 'Encontrada cerca de la quebrada', is_favorite: true, occurrences_count: 99 })
        .expect(200);

      expect(res.body.data.notes).toBe('Encontrada cerca de la quebrada');
      expect(res.body.data.is_favorite).toBe(true);
      expect(res.body.data.occurrences_count).toBe(2);

      await request(app).patch('/collection/pyrite').set(auth(user.token)).send({}).expect(400);
      await request(app).patch('/collection/obsidian').set(auth(user.token)).send({ notes: 'x' }).expect(404);
    });

    test('GET /collection?include_locked=true lists discovered and locked specimens', async () => {
      const res = await request(app)
        .get('/collection?include_locked=true')
        .set(auth(user.token))
        .expect(200);

      expect(res.body.data.length).toBeGreaterThanOrEqual(12);
      const quartz = res.body.data.find((s) => s.specimen_id === 'quartz');
      const obsidian = res.body.data.find((s) => s.specimen_id === 'obsidian');

      expect(quartz.is_discovered).toBe(true);
      expect(quartz.occurrences_count).toBe(3);
      expect(obsidian.is_discovered).toBe(false);
    });

    test('the collection can be filtered by category', async () => {
      const minerals = await request(app).get('/collection?category=mineral').set(auth(user.token)).expect(200);
      expect(minerals.body.data).toHaveLength(2);

      const igneous = await request(app).get('/collection?category=igneous_rock').set(auth(user.token)).expect(200);
      expect(igneous.body.data).toHaveLength(0);

      await request(app).get('/collection?category_id=abc').set(auth(user.token)).expect(400);
    });

    test('the favorite filter narrows the list without changing what counts as discovered', async () => {
      await request(app).patch('/collection/pyrite').set(auth(user.token)).send({ is_favorite: true }).expect(200);
      await request(app).patch('/collection/quartz').set(auth(user.token)).send({ is_favorite: false }).expect(200);

      const favorites = await request(app).get('/collection?favorite=true').set(auth(user.token)).expect(200);
      expect(favorites.body.data.map((entry) => entry.specimen_id)).toEqual(['pyrite']);

      // With the locked specimens included, discovered ones stay discovered whatever the filter.
      const all = await request(app).get('/collection?include_locked=true').set(auth(user.token)).expect(200);
      const onlyFavorites = await request(app).get('/collection?include_locked=true&favorite=true').set(auth(user.token)).expect(200);
      const notFavorites = await request(app).get('/collection?include_locked=true&favorite=false').set(auth(user.token)).expect(200);

      expect(onlyFavorites.body.data).toHaveLength(1);
      expect(onlyFavorites.body.data[0]).toMatchObject({ specimen_id: 'pyrite', is_discovered: true, is_favorite: true });

      const quartz = notFavorites.body.data.find((entry) => entry.specimen_id === 'quartz');
      expect(quartz).toMatchObject({ is_discovered: true, is_favorite: false });
      expect(notFavorites.body.data.find((entry) => entry.specimen_id === 'pyrite')).toBeUndefined();

      expect(onlyFavorites.body.data.length + notFavorites.body.data.length).toBe(all.body.data.length);
      expect(notFavorites.body.data.filter((entry) => entry.is_discovered)).toHaveLength(1);
    });
  });

  test('the collection requires authentication', async () => {
    await request(app).get('/collection').expect(401);
    await request(app).get('/collection/progress').expect(401);
  });
});

describe('Progress and statistics', () => {
  test('GET /collection/progress reports discoveries, recognitions, achievements and history', async () => {
    const user = await registerUser(app);
    await discover(user, ['quartz', 'quartz', 'basalt']);

    const res = await request(app).get('/collection/progress').set(auth(user.token)).expect(200);
    const progress = res.body.data;

    expect(progress.total_specimens).toBeGreaterThanOrEqual(12);
    expect(progress.total_discovered).toBe(2);
    expect(progress.overall_percentage).toBe(Math.round((2 / progress.total_specimens) * 100));
    expect(progress.categories.mineral).toMatchObject({ discovered: 1 });
    expect(progress.categories.igneous_rock).toMatchObject({ discovered: 1 });
    expect(progress.categories.sedimentary_rock.discovered).toBe(0);
    expect(progress.types.silicato.discovered).toBe(2);

    expect(progress.total_recognitions).toBe(3);
    // FIRST_SCAN is unlocked by the first recognition.
    expect(progress.total_achievements_unlocked).toBeGreaterThanOrEqual(1);
    expect(progress.experience.experience_points).toBeGreaterThan(0);
    expect(progress.guest_quota).toBeNull();

    const types = progress.activity_history.map((event) => event.type);
    expect(types).toEqual(expect.arrayContaining(['recognition', 'discovery', 'achievement_unlocked']));
    expect(progress.activity_history.length).toBeLessThanOrEqual(20);

    const limited = await request(app).get('/collection/progress?activity_limit=2').set(auth(user.token)).expect(200);
    expect(limited.body.data.activity_history).toHaveLength(2);
  });

  test('a guest session sees the progress of its temporary session, with its remaining quota', async () => {
    const guest = await createGuest(app);
    await recognize(app, guest.token, 'pyrite').expect(200);

    const res = await request(app).get('/collection/progress').set(auth(guest.token)).expect(200);
    expect(res.body.data.total_discovered).toBe(1);
    expect(res.body.data.total_recognitions).toBe(1);
    expect(res.body.data.guest_quota).toEqual({ limit: 10, used: 1, remaining: 9 });
  });
});
