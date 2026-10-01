const request = require('supertest');
const { Category, Type, Specimen } = require('../src/models');
const { createApp, auth, createAdmin, registerUser, createGuest, uniqueEmail } = require('./helpers');

const app = createApp();

// Categories and types are two independent entities with identical rules.
describe.each([
  { path: '/category', Model: Category, field: 'category_id', label: 'Category', seeded: 'mineral', body: 'categoryId' },
  { path: '/type', Model: Type, field: 'type_id', label: 'Type', seeded: 'silicato', body: 'typeId' }
])('Taxonomy: $path', ({ path, Model, field, label, seeded, body }) => {
  let admin;
  const suffix = Date.now().toString(36);

  beforeAll(async () => {
    admin = await createAdmin();
  });

  describe('reading is public', () => {
    test(`GET ${path} lists the entries with the number of rocks linked to each`, async () => {
      const res = await request(app).get(path).expect(200);
      const entry = res.body.data.find((item) => item.name === seeded);

      expect(entry).toBeDefined();
      expect(entry.rock_count).toBeGreaterThan(0);
      expect(res.body.data.map((item) => item.name)).toEqual([...res.body.data.map((item) => item.name)].sort());
    });

    test(`GET ${path}/:id returns one entry and 404 for unknown ones`, async () => {
      const row = await Model.findOne({ where: { name: seeded } });
      const res = await request(app).get(`${path}/${row.id}`).expect(200);
      expect(res.body.data).toMatchObject({ id: row.id, name: seeded });

      await request(app).get(`${path}/999999`).expect(404);
      await request(app).get(`${path}/not-a-number`).expect(404);
    });

    test(`GET ${path}/:id/rocks lists the rocks that belong to the entry`, async () => {
      const row = await Model.findOne({ where: { name: seeded } });
      const res = await request(app).get(`${path}/${row.id}/rocks?limit=2&page=1`).expect(200);

      expect(res.body.data.rocks.length).toBeLessThanOrEqual(2);
      expect(res.body.data.rocks.length).toBeGreaterThan(0);
      res.body.data.rocks.forEach((rock) => expect(rock[field]).toBe(row.id));
      expect(res.body.data.pagination.total).toBeGreaterThan(0);

      await request(app).get(`${path}/999999/rocks`).expect(404);
      await request(app).get(`${path}/${row.id}/rocks?limit=abc`).expect(400);
    });
  });

  describe('changes are reserved for administrators', () => {
    test('anonymous requests, guests and regular users are refused', async () => {
      const user = await registerUser(app);
      const guest = await createGuest(app);
      const row = await Model.findOne({ where: { name: seeded } });

      const attempts = (token) => [
        () => { const r = request(app).post(path); return token ? r.set(auth(token)) : r; },
        () => { const r = request(app).put(`${path}/${row.id}`); return token ? r.set(auth(token)) : r; },
        () => { const r = request(app).patch(`${path}/${row.id}`); return token ? r.set(auth(token)) : r; },
        () => { const r = request(app).delete(`${path}/${row.id}`); return token ? r.set(auth(token)) : r; }
      ];

      for (const send of attempts(null)) {
        expect((await send().send({ name: 'nuevo' })).status).toBe(401);
      }
      for (const token of [guest.token, user.token]) {
        for (const send of attempts(token)) {
          expect((await send().send({ name: 'nuevo' })).status).toBe(403);
        }
      }
      expect(await Model.findByPk(row.id)).not.toBeNull();
    });
  });

  describe('administration', () => {
    test('creating stores a normalized name and rejects duplicates, however they are written', async () => {
      const res = await request(app)
        .post(path)
        .set(auth(admin.token))
        .send({ name: `  Volcanic   Glass ${suffix} `, description: 'Vidrio volcánico' })
        .expect(201);

      const expectedName = `volcanic glass ${suffix}`;
      expect(res.body.data).toMatchObject({ name: expectedName, description: 'Vidrio volcánico', rock_count: 0 });

      await request(app).post(path).set(auth(admin.token)).send({ name: expectedName }).expect(409);
      const upper = await request(app).post(path).set(auth(admin.token)).send({ name: expectedName.toUpperCase() }).expect(409);
      expect(upper.body).toMatchObject({ errorCode: '409_CONFLICT', details: { field: 'name' } });
    });

    test('names are validated', async () => {
      await request(app).post(path).set(auth(admin.token)).send({}).expect(400);
      await request(app).post(path).set(auth(admin.token)).send({ name: 'a' }).expect(400);
      await request(app).post(path).set(auth(admin.token)).send({ name: 'x'.repeat(61) }).expect(400);
      await request(app).post(path).set(auth(admin.token)).send({ name: 123 }).expect(400);
    });

    test('updating renames and edits the description, without colliding with other entries', async () => {
      const created = await request(app).post(path).set(auth(admin.token)).send({ name: `edit me ${suffix}` }).expect(201);
      const id = created.body.data.id;

      const renamed = await request(app)
        .put(`${path}/${id}`)
        .set(auth(admin.token))
        .send({ name: `Edited ${suffix}`, description: 'Nueva descripción' })
        .expect(200);
      expect(renamed.body.data).toMatchObject({ name: `edited ${suffix}`, description: 'Nueva descripción' });

      await request(app).patch(`${path}/${id}`).set(auth(admin.token)).send({ description: 'Solo descripción' }).expect(200);
      const renamedToTaken = await request(app).patch(`${path}/${id}`).set(auth(admin.token)).send({ name: seeded }).expect(409);
      expect(renamedToTaken.body).toMatchObject({ errorCode: '409_CONFLICT', details: { field: 'name' } });
      await request(app).patch(`${path}/${id}`).set(auth(admin.token)).send({}).expect(400);
      await request(app).patch(`${path}/999999`).set(auth(admin.token)).send({ name: 'whatever' }).expect(404);

      // Keeping its own name is not a conflict.
      await request(app).put(`${path}/${id}`).set(auth(admin.token)).send({ name: `edited ${suffix}` }).expect(200);
    });

    test('an entry with rocks cannot be deleted; an empty one can', async () => {
      const row = await Model.findOne({ where: { name: seeded } });
      const blocked = await request(app).delete(`${path}/${row.id}`).set(auth(admin.token)).expect(400);
      expect(blocked.body.message).toMatch(/rock\(s\) are still associated/);
      expect(blocked.body.details.rock_count).toBeGreaterThan(0);
      expect(await Model.findByPk(row.id)).not.toBeNull();

      const empty = await request(app).post(path).set(auth(admin.token)).send({ name: `disposable ${suffix}` }).expect(201);
      await request(app).delete(`${path}/${empty.body.data.id}`).set(auth(admin.token)).expect(200);
      await request(app).get(`${path}/${empty.body.data.id}`).expect(404);
      await request(app).delete(`${path}/${empty.body.data.id}`).set(auth(admin.token)).expect(404);

      const removed = await Model.findByPk(empty.body.data.id, { paranoid: false });
      expect(removed.is_deleted).toBe(true);
      expect(removed.deleted_at).not.toBeNull();
    });

    test('deleting is also blocked while only some rocks use the entry, and allowed once none do', async () => {
      const entry = await request(app).post(path).set(auth(admin.token)).send({ name: `temporary ${suffix}` }).expect(201);
      const other = await Model.findOne({ where: { name: seeded } });

      const rock = await request(app)
        .post('/rock')
        .set(auth(admin.token))
        .send({
          name: `Roca temporal ${suffix}`,
          description: 'Muestra de prueba',
          imgUrl: 'https://example.com/rock.jpg',
          categoryId: field === 'category_id' ? entry.body.data.id : 1,
          typeId: field === 'type_id' ? entry.body.data.id : 1
        })
        .expect(201);
      expect(other).not.toBeNull();

      await request(app).delete(`${path}/${entry.body.data.id}`).set(auth(admin.token)).expect(400);

      await request(app).delete(`/rock/${rock.body.rock.id}`).set(auth(admin.token)).expect(200);
      await request(app).delete(`${path}/${entry.body.data.id}`).set(auth(admin.token)).expect(200);
    });

    test('a deleted name can be created again: the old entry is restored, never duplicated', async () => {
      const name = `comeback ${suffix}`;
      const first = await request(app).post(path).set(auth(admin.token)).send({ name, description: 'v1' }).expect(201);
      await request(app).delete(`${path}/${first.body.data.id}`).set(auth(admin.token)).expect(200);

      const again = await request(app).post(path).set(auth(admin.token)).send({ name: name.toUpperCase(), description: 'v2' }).expect(201);
      expect(again.body.data.id).toBe(first.body.data.id);
      expect(again.body.data.description).toBe('v2');
      expect(again.body.message).toMatch(/restored/);

      const restored = await Model.findByPk(first.body.data.id);
      expect(restored.is_deleted).toBe(false);
      expect(await Model.count({ where: { name }, paranoid: false })).toBe(1);
    });

    test('a name held by a deleted entry cannot be taken by renaming another one', async () => {
      const gone = await request(app).post(path).set(auth(admin.token)).send({ name: `gone ${suffix}` }).expect(201);
      await request(app).delete(`${path}/${gone.body.data.id}`).set(auth(admin.token)).expect(200);

      const other = await request(app).post(path).set(auth(admin.token)).send({ name: `other ${suffix}` }).expect(201);
      const res = await request(app)
        .patch(`${path}/${other.body.data.id}`)
        .set(auth(admin.token))
        .send({ name: `gone ${suffix}` })
        .expect(409);
      expect(res.body.message).toMatch(/deleted record/);
    });

    test(`the ${body} of a rock must reference an existing, non-deleted ${label.toLowerCase()}`, async () => {
      const gone = await request(app).post(path).set(auth(admin.token)).send({ name: `vanished ${suffix}` }).expect(201);
      await request(app).delete(`${path}/${gone.body.data.id}`).set(auth(admin.token)).expect(200);

      const payload = (id) => ({
        name: `Roca huérfana ${id}${suffix}`,
        description: 'Muestra de prueba',
        imgUrl: 'https://example.com/rock.jpg',
        categoryId: 1,
        typeId: 1,
        [body]: id
      });

      const missing = await request(app).post('/rock').set(auth(admin.token)).send(payload(987654)).expect(400);
      expect(missing.body.message).toMatch(/no existe/);
      await request(app).post('/rock').set(auth(admin.token)).send(payload(gone.body.data.id)).expect(400);
    });
  });
});

describe('Taxonomy consistency', () => {
  test('renaming a category updates the readable name kept on its rocks', async () => {
    const admin = await createAdmin();
    const suffix = Date.now().toString(36);

    const category = await request(app).post('/category').set(auth(admin.token)).send({ name: `before ${suffix}` }).expect(201);
    const rock = await request(app)
      .post('/rock')
      .set(auth(admin.token))
      .send({
        name: `Roca de categoría ${suffix}`,
        description: 'Muestra de prueba',
        imgUrl: 'https://example.com/rock.jpg',
        categoryId: category.body.data.id,
        typeId: 1
      })
      .expect(201);
    expect(rock.body.rock.category).toBe(`before ${suffix}`);

    await request(app).patch(`/category/${category.body.data.id}`).set(auth(admin.token)).send({ name: `after ${suffix}` }).expect(200);

    const stored = await Specimen.findByPk(rock.body.rock.id);
    expect(stored.category).toBe(`after ${suffix}`);
    expect(stored.category_id).toBe(category.body.data.id);

    // The new name works in filters straight away; the old one matches nothing.
    const byNew = await request(app).get(`/rock?category=after ${suffix}`).expect(200);
    expect(byNew.body.rocks.map((r) => r.id)).toEqual([rock.body.rock.id]);
    const byOld = await request(app).get(`/rock?category=before ${suffix}`).expect(200);
    expect(byOld.body.rocks).toHaveLength(0);
  });

  test('every seeded rock is linked to a category and a type', async () => {
    const unlinked = await Specimen.count({ where: { category_id: null } });
    const untyped = await Specimen.count({ where: { type_id: null } });
    expect(unlinked).toBe(0);
    expect(untyped).toBe(0);

    const seeded = await Specimen.findAll({ include: [{ model: Category, as: 'category_rel' }] });
    seeded.forEach((rock) => expect(rock.category).toBe(rock.category_rel.name));
  });

  test('a category created by an administrator shows up in the catalog taxonomy', async () => {
    const admin = await createAdmin();
    const name = `fresh ${Date.now().toString(36)}`;
    await request(app).post('/category').set(auth(admin.token)).send({ name }).expect(201);

    const res = await request(app).get('/specimen/categories').expect(200);
    expect(res.body.data.find((entry) => entry.category === name)).toMatchObject({ total_specimens: 0 });

    const progress = await request(app).get('/collection/progress').set(auth((await registerUser(app, { email: uniqueEmail() })).token)).expect(200);
    expect(progress.body.data.categories[name]).toMatchObject({ total: 0, discovered: 0 });
  });
});
