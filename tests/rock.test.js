const fs = require('fs');
const path = require('path');
const request = require('supertest');
const env = require('../src/config/env');
const { generateToken, verifyToken, extractTokenFromHeader } = require('../src/services/token.service');
const { Specimen, Category, Type } = require('../src/models');
const { createApp, auth, createAdmin, registerUser, createGuest, makeImage, storedSpecimenImages } = require('./helpers');

const app = createApp();

const newRock = (overrides = {}) => {
  const timestamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  return {
    name: `Obsidiana Negra ${timestamp}`,
    scientificName: `Obsidianus Volcanicus ${timestamp}`,
    index: Number(timestamp.slice(-7)),
    typeId: 1,
    categoryId: 2,
    hardness: 5.5,
    density: 2.35,
    transparency: 0.15, // decimal values are stored as floats
    tenacity: 2.5,
    molarWeight: 60.08,
    description: 'Vidrio volcánico natural',
    composition: 'SiO2 con inclusiones de óxidos de hierro',
    commonUses: 'Herramientas de corte, joyería y decoración',
    imgUrl: 'https://example.com/obsidiana.jpg',
    ...overrides
  };
};

describe('Token Service', () => {
  test('should generate, verify and extract JWT tokens', () => {
    const token = generateToken('user-123', 'user', false);
    expect(typeof token).toBe('string');

    const decoded = verifyToken(token);
    expect(decoded.userId).toBe('user-123');
    expect(decoded.role).toBe('user');
    expect(decoded.tokenVersion).toBe(1);

    const extracted = extractTokenFromHeader(`Bearer ${token}`);
    expect(extracted).toBe(token);

    expect(extractTokenFromHeader(undefined)).toBeNull();
    expect(extractTokenFromHeader('Basic 123')).toBeNull();
  });
});

describe('Rock catalog administration (/rock and classroom aliases /api/rock)', () => {
  let admin;
  let createdRockId = '';

  beforeAll(async () => {
    admin = await createAdmin();
  });

  describe('access control', () => {
    test.each([
      ['POST', '/api/rock/agregar'],
      ['POST', '/rock'],
      ['POST', '/api/rock'],
      ['PATCH', '/api/rock/actualizar/quartz'],
      ['PATCH', '/rock/quartz'],
      ['PUT', '/rock/quartz'],
      ['DELETE', '/api/rock/eliminar/quartz'],
      ['DELETE', '/rock/quartz']
    ])('%s %s requires a token and the admin role', async (method, url) => {
      const send = (token) => {
        const req = request(app)[method.toLowerCase()](url);
        return (token ? req.set(auth(token)) : req).send(newRock());
      };

      expect((await send(null)).status).toBe(401);
      expect((await send((await createGuest(app)).token)).status).toBe(403);
      expect((await send((await registerUser(app)).token)).status).toBe(403);
    });

    test('a rejected request does not modify the catalog', async () => {
      const user = await registerUser(app);
      await request(app).delete('/rock/quartz').set(auth(user.token)).expect(403);
      await request(app).patch('/rock/quartz').set(auth(user.token)).send({ description: 'hacked' }).expect(403);

      const quartz = await Specimen.findByPk('quartz');
      expect(quartz).not.toBeNull();
      expect(quartz.description).not.toBe('hacked');
    });
  });

  describe('creation', () => {
    test('POST /api/rock/agregar - Should create rock with float physical properties and associations', async () => {
      const payload = newRock();
      const res = await request(app)
        .post('/api/rock/agregar')
        .set(auth(admin.token))
        .send(payload)
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.rock).toBeDefined();
      expect(res.body.rock.transparency).toBe(0.15);
      expect(res.body.rock.tenacity).toBe(2.5);
      expect(res.body.rock.density).toBe(2.35);
      expect(res.body.rock.is_deleted).toBe(false);
      expect(res.body.rock.type_id).toBe(1);
      expect(res.body.rock.category_id).toBe(2);
      expect(res.body.rock.full_image_url).toBe(payload.imgUrl);
      expect(res.body.rock.category_rel.name).toBe('igneous_rock');
      expect(res.body.rock.type_rel.name).toBe('silicato');

      createdRockId = res.body.rock.id;
    });

    test('the identifier generated for a rock is a readable, accent-free slug', async () => {
      const res = await request(app)
        .post('/rock')
        .set(auth(admin.token))
        .send(newRock({ name: `Piedra Pómez ${Date.now()}`, scientificName: undefined }))
        .expect(201);

      expect(res.body.rock.id).toMatch(/^piedra_pomez_\d+_[0-9a-f]{6}$/);

      const custom = await request(app)
        .post('/rock')
        .set(auth(admin.token))
        .send(newRock({ id: `custom-id-${Date.now()}` }))
        .expect(201);
      expect(custom.body.rock.id).toMatch(/^custom-id-\d+$/);
      await request(app).post('/rock').set(auth(admin.token)).send(newRock({ id: 'bad id!' })).expect(400);
    });

    test('the readable category always follows category_id (not a default)', async () => {
      const res = await request(app)
        .post('/rock')
        .set(auth(admin.token))
        .send(newRock({ categoryId: 4 }))
        .expect(201);

      expect(res.body.rock.category).toBe('metamorphic_rock');
      const stored = await Specimen.findByPk(res.body.rock.id);
      expect(stored.category).toBe('metamorphic_rock');
    });

    test('incomplete or inconsistent rocks are rejected', async () => {
      const post = (payload) => request(app).post('/rock').set(auth(admin.token)).send(payload);
      const without = (key) => {
        const payload = newRock();
        delete payload[key];
        return payload;
      };

      for (const key of ['name', 'description', 'typeId', 'categoryId', 'imgUrl']) {
        const res = await post(without(key)).expect(400);
        expect(res.body.errorCode).toBe('400_VALIDATION_ERROR');
      }

      await post(newRock({ categoryId: 'abc' })).expect(400);
      await post(newRock({ typeId: 0 })).expect(400);
      await post(newRock({ categoryId: 9999 })).expect(400);
      await post(newRock({ typeId: 9999 })).expect(400);
      await post(newRock({ hardness: 11 })).expect(400);
      await post(newRock({ hardness: undefined, mohs_hardness_min: 7, mohs_hardness_max: 3 })).expect(400);
      await post(newRock({ imgUrl: 'javascript:alert(1)' })).expect(400);
      await post(newRock({ density: -1 })).expect(400);
      await post(newRock({ density: 'abc' })).expect(400);
      await post(newRock({ transparency: 'mucha' })).expect(400);
      await post(newRock({ name: '   ' })).expect(400);
      await request(app).post('/rock').set(auth(admin.token)).expect(400);
    });

    test('a rock that already exists cannot be added twice', async () => {
      const payload = newRock();
      await request(app).post('/rock').set(auth(admin.token)).send(payload).expect(201);
      const duplicate = await request(app).post('/rock').set(auth(admin.token)).send({ ...payload, index: undefined }).expect(400);
      expect(duplicate.body.message).toMatch(/ya esté en el sistema/);
    });

    test('fields outside the catalog schema are ignored', async () => {
      const res = await request(app)
        .post('/rock')
        .set(auth(admin.token))
        .send(newRock({ is_deleted: true, is_active: false, deleted_at: '2020-01-01', category: 'whatever' }))
        .expect(201);

      expect(res.body.rock.is_deleted).toBe(false);
      expect(res.body.rock.is_active).toBe(true);
      expect(res.body.rock.category).toBe('igneous_rock');
    });
  });

  describe('image upload', () => {
    const fields = (rock) => Object.entries(rock).filter(([, value]) => value !== undefined && typeof value !== 'object');

    test('a rock can be created with an image file (multipart) instead of a URL', async () => {
      const rock = newRock({ imgUrl: undefined });
      let req = request(app).post('/rock').set(auth(admin.token));
      fields(rock).forEach(([key, value]) => { req = req.field(key, String(value)); });
      const res = await req.attach('image', makeImage(600)).expect(201);

      expect(res.body.rock.full_image_url).toMatch(/^\/uploads\/specimens\/[0-9a-f-]+\.jpg$/);
      expect(res.body.rock.thumbnail_url).toBe(res.body.rock.full_image_url);
      expect(fs.existsSync(path.join(env.SPECIMEN_UPLOAD_DIR, path.basename(res.body.rock.full_image_url)))).toBe(true);

      // ... and it is served back, never sniffed into another content type.
      const served = await request(app).get(res.body.rock.full_image_url).expect(200);
      expect(served.headers['x-content-type-options']).toBe('nosniff');
    });

    test('the stored file extension comes from the allowed MIME type, never from the file name', async () => {
      const rock = newRock({ imgUrl: undefined });
      let req = request(app).post('/rock').set(auth(admin.token));
      fields(rock).forEach(([key, value]) => { req = req.field(key, String(value)); });
      const res = await req
        .attach('image', Buffer.from('<script>alert(1)</script>'), { filename: 'evil.html', contentType: 'image/jpeg' })
        .expect(201);

      expect(res.body.rock.full_image_url).toMatch(/\.jpg$/);
      expect(res.body.rock.full_image_url).not.toMatch(/html/);
    });

    test('files that are not images are rejected and nothing is left on disk', async () => {
      const before = storedSpecimenImages().length;
      const rock = newRock({ imgUrl: undefined });
      let req = request(app).post('/rock').set(auth(admin.token));
      fields(rock).forEach(([key, value]) => { req = req.field(key, String(value)); });
      await req.attach('image', Buffer.from('plain text'), { filename: 'notes.txt', contentType: 'text/plain' }).expect(400);

      expect(storedSpecimenImages()).toHaveLength(before);
    });

    test('a valid image attached to an invalid rock is deleted with the failed request', async () => {
      const before = storedSpecimenImages().length;
      let req = request(app).post('/rock').set(auth(admin.token));
      fields(newRock({ imgUrl: undefined, typeId: undefined })).forEach(([key, value]) => { req = req.field(key, String(value)); });
      await req.attach('image', makeImage(600)).expect(400);

      expect(storedSpecimenImages()).toHaveLength(before);
    });

    test('unauthorized uploads are refused before anything is stored', async () => {
      const before = storedSpecimenImages().length;
      const user = await registerUser(app);
      await request(app).post('/rock').set(auth(user.token)).field('name', 'x').attach('image', makeImage(600)).expect(403);
      await request(app).post('/rock').field('name', 'x').attach('image', makeImage(600)).expect(401);

      expect(storedSpecimenImages()).toHaveLength(before);
    });
  });

  describe('reading (public)', () => {
    test('GET /api/rock - Should list active rocks including category and type relations', async () => {
      const res = await request(app).get('/api/rock').expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.rocks)).toBe(true);
      expect(res.body.rocks.length).toBeGreaterThanOrEqual(13);

      const created = res.body.rocks.find((r) => r.id === createdRockId);
      expect(created).toBeDefined();
      expect(created.category_rel).toMatchObject({ id: 2, name: 'igneous_rock' });
      expect(created.type_rel).toMatchObject({ id: 1, name: 'silicato' });
      expect(res.body.pagination).toBeUndefined();
    });

    test('GET /api/rock/:id - Should retrieve rock by ID', async () => {
      const res = await request(app).get(`/api/rock/${createdRockId}`).expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.rock.id).toBe(createdRockId);
      await request(app).get('/rock/does_not_exist').expect(404);
    });

    test('rocks can be filtered by type and by category (ids or names)', async () => {
      const igneous = await request(app).get('/rock?category_id=2').expect(200);
      expect(igneous.body.rocks.length).toBeGreaterThanOrEqual(4);
      igneous.body.rocks.forEach((rock) => expect(rock.category_id).toBe(2));

      const byName = await request(app).get('/rock?category=Igneous_Rock').expect(200);
      expect(byName.body.rocks.map((r) => r.id).sort()).toEqual(igneous.body.rocks.map((r) => r.id).sort());

      const carbonates = await request(app).get('/rock?type=carbonato').expect(200);
      expect(carbonates.body.rocks.map((r) => r.id).sort()).toEqual(['calcite', 'limestone', 'marble']);

      const both = await request(app).get('/rock?category_id=3&type_id=4').expect(200);
      expect(both.body.rocks.map((r) => r.id)).toEqual(['limestone']);

      const none = await request(app).get('/rock?category=does-not-exist').expect(200);
      expect(none.body.rocks).toHaveLength(0);
    });

    test('rocks can be searched, filtered by rarity/magnetism and paginated', async () => {
      const search = await request(app).get('/rock?q=cuarzo').expect(200);
      expect(search.body.rocks.map((r) => r.id)).toContain('quartz');

      const magnetic = await request(app).get('/rock?magnetism=true').expect(200);
      expect(magnetic.body.rocks.map((r) => r.id)).toEqual(['magnetite']);

      const uncommon = await request(app).get('/rock?rarity=uncommon').expect(200);
      expect(uncommon.body.rocks.map((r) => r.id).sort()).toEqual(['magnetite', 'obsidian']);

      const page = await request(app).get('/rock?limit=5&page=2').expect(200);
      expect(page.body.rocks).toHaveLength(5);
      expect(page.body.pagination).toMatchObject({ page: 2, limit: 5 });
      expect(page.body.pagination.total).toBeGreaterThanOrEqual(13);
    });

    test('a page size above the maximum is reduced to it', async () => {
      const res = await request(app).get('/rock?limit=1000').expect(200);
      expect(res.body.pagination.limit).toBe(100);
    });

    test('malformed filters are rejected with 400 instead of reaching the database', async () => {
      for (const query of ['limit=abc', 'page=0', 'limit=0', 'category_id=x', 'type_id=1.5', 'magnetism=maybe', 'rarity=epic']) {
        const res = await request(app).get(`/rock?${query}`).expect(400);
        expect(res.body.errorCode).toBe('400_VALIDATION_ERROR');
      }
    });
  });

  describe('updating and deleting', () => {
    test('PATCH /api/rock/actualizar/:id - Should update rock fields', async () => {
      const res = await request(app)
        .patch(`/api/rock/actualizar/${createdRockId}`)
        .set(auth(admin.token))
        .send({
          description: 'Descripción actualizada de obsidiana',
          density: 2.40
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.rock.description).toBe('Descripción actualizada de obsidiana');
      expect(res.body.rock.density).toBe(2.40);
    });

    test('changing the category or type through the API keeps the taxonomy consistent', async () => {
      const res = await request(app)
        .put(`/rock/${createdRockId}`)
        .set(auth(admin.token))
        .send({ categoryId: 3, typeId: 4 })
        .expect(200);

      expect(res.body.rock).toMatchObject({ category_id: 3, type_id: 4, category: 'sedimentary_rock' });
      expect(res.body.rock.category_rel.name).toBe('sedimentary_rock');

      // The readable copy of the category is persisted, not only returned.
      const stored = await Specimen.findByPk(createdRockId);
      expect([stored.category_id, stored.type_id, stored.category]).toEqual([3, 4, 'sedimentary_rock']);

      await request(app).patch(`/rock/${createdRockId}`).set(auth(admin.token)).send({ categoryId: 9999 }).expect(400);
      await request(app).patch(`/rock/${createdRockId}`).set(auth(admin.token)).send({ typeId: null }).expect(400);
      await request(app).patch(`/rock/${createdRockId}`).set(auth(admin.token)).send({}).expect(400);
      await request(app).patch(`/rock/${createdRockId}`).set(auth(admin.token)).send({ mohs_hardness_min: 9 }).expect(400);
      await request(app).patch('/rock/does_not_exist').set(auth(admin.token)).send({ description: 'x' }).expect(404);
    });

    test('a partial update does not overwrite fields that were not sent', async () => {
      const created = await request(app)
        .post('/rock')
        .set(auth(admin.token))
        .send(newRock({ name: `Solo nombre ${Date.now()}`, name_en: 'English Name' }))
        .expect(201);

      const res = await request(app)
        .patch(`/rock/${created.body.rock.id}`)
        .set(auth(admin.token))
        .send({ name_es: 'Nombre nuevo' })
        .expect(200);

      expect(res.body.rock.name_es).toBe('Nombre nuevo');
      expect(res.body.rock.name_en).toBe('English Name');
    });

    test('a rock can be deactivated without deleting it', async () => {
      const created = await request(app).post('/rock').set(auth(admin.token)).send(newRock()).expect(201);
      const id = created.body.rock.id;

      await request(app).patch(`/rock/${id}`).set(auth(admin.token)).send({ is_active: false }).expect(200);

      const publicList = await request(app).get('/rock').expect(200);
      expect(publicList.body.rocks.map((r) => r.id)).not.toContain(id);
      await request(app).get(`/rock/${id}`).expect(404);
      await request(app).get(`/specimen/${id}`).expect(404);

      const adminList = await request(app).get('/rock?include_inactive=true').set(auth(admin.token)).expect(200);
      expect(adminList.body.rocks.map((r) => r.id)).toContain(id);
      await request(app).get(`/rock/${id}`).set(auth(admin.token)).expect(200);

      // Only administrators can see deactivated rocks.
      const user = await registerUser(app);
      const userList = await request(app).get('/rock?include_inactive=true').set(auth(user.token)).expect(200);
      expect(userList.body.rocks.map((r) => r.id)).not.toContain(id);
    });

    test('DELETE /api/rock/eliminar/:id - Should execute dual soft delete (date + boolean)', async () => {
      const res = await request(app)
        .delete(`/api/rock/eliminar/${createdRockId}`)
        .set(auth(admin.token))
        .expect(200);

      expect(res.body.success).toBe(true);

      // Verify rock is excluded from active listings
      const listRes = await request(app).get('/api/rock').expect(200);
      expect(listRes.body.rocks.find((r) => r.id === createdRockId)).toBeUndefined();

      // Verify in raw DB that is_deleted=true and deleted_at is set
      const rawRecord = await Specimen.findOne({
        where: { id: createdRockId },
        paranoid: false
      });
      expect(rawRecord).toBeDefined();
      expect(rawRecord.is_deleted).toBe(true);
      expect(rawRecord.deleted_at).not.toBeNull();

      await request(app).delete(`/rock/${createdRockId}`).set(auth(admin.token)).expect(404);
    });
  });
});

describe('Classroom alias routes for users (/api/user)', () => {
  test('POST /api/user/registro & /api/user/login - Should register and login via classroom alias paths', async () => {
    const timestamp = Date.now();
    const email = `alias_${timestamp}@example.com`;
    const password = 'StrongPassword123!';

    const regRes = await request(app)
      .post('/api/user/registro')
      .send({
        email,
        password,
        userName: `aliasuser_${timestamp}`
      })
      .expect(201);

    expect(regRes.body.success).toBe(true);
    expect(regRes.body.data.token).toBeDefined();

    const loginRes = await request(app)
      .post('/api/user/login')
      .send({
        email,
        password
      })
      .expect(200);

    expect(loginRes.body.success).toBe(true);
    expect(loginRes.body.data.token).toBeDefined();
  });
});

describe('Seeded taxonomy', () => {
  test('types and categories used by the catalog exist', async () => {
    expect((await Category.count()) >= 4).toBe(true);
    expect((await Type.count()) >= 4).toBe(true);
  });
});

describe('Rock catalog hardening', () => {
  let admin;
  const form = (overrides) => Object.entries(newRock(overrides)).filter(([, value]) => value !== undefined && typeof value !== 'object');

  beforeAll(async () => {
    admin = await createAdmin();
  });

  test('the picture of a rock that is replaced does not stay on disk', async () => {
    let create = request(app).post('/rock').set(auth(admin.token));
    form({ imgUrl: undefined }).forEach(([key, value]) => { create = create.field(key, String(value)); });
    const created = await create.attach('image', makeImage(600)).expect(201);
    const first = path.join(env.SPECIMEN_UPLOAD_DIR, path.basename(created.body.rock.full_image_url));
    expect(fs.existsSync(first)).toBe(true);

    // Replaced by another upload ...
    const second = await request(app).patch(`/rock/${created.body.rock.id}`).set(auth(admin.token)).attach('image', makeImage(650)).expect(200);
    const secondFile = path.join(env.SPECIMEN_UPLOAD_DIR, path.basename(second.body.rock.full_image_url));
    expect(fs.existsSync(first)).toBe(false);
    expect(fs.existsSync(secondFile)).toBe(true);

    // ... and by a link to an external picture.
    await request(app).patch(`/rock/${created.body.rock.id}`).set(auth(admin.token)).send({ imgUrl: 'https://example.com/a.jpg' }).expect(200);
    expect(fs.existsSync(secondFile)).toBe(false);

    // Nothing to delete when the previous picture was an external link; keeping the same one is harmless.
    await request(app).patch(`/rock/${created.body.rock.id}`).set(auth(admin.token)).send({ imgUrl: 'https://example.com/b.jpg' }).expect(200);
    await request(app).patch(`/rock/${created.body.rock.id}`).set(auth(admin.token)).send({ imgUrl: 'https://example.com/b.jpg', description: 'Otra descripción' }).expect(200);
  });

  test('only files inside the upload folder can ever be removed', async () => {
    const outside = path.join(env.SPECIMEN_UPLOAD_DIR, '..', 'precious.txt');
    fs.writeFileSync(outside, 'keep me');

    const created = await request(app).post('/rock').set(auth(admin.token)).send(newRock({ imgUrl: '/uploads/specimens/../precious.txt' })).expect(201);
    await request(app).patch(`/rock/${created.body.rock.id}`).set(auth(admin.token)).send({ imgUrl: 'https://example.com/c.jpg' }).expect(200);

    expect(fs.existsSync(outside)).toBe(true);
    fs.rmSync(outside);
  });

  test('forms with too many fields or oversized values are refused, leaving no file behind', async () => {
    const before = storedSpecimenImages().length;

    let crowded = request(app).post('/rock').set(auth(admin.token));
    form().forEach(([key, value]) => { crowded = crowded.field(key, String(value)); });
    for (let index = 0; index < 70; index += 1) crowded = crowded.field(`extra_${index}`, 'x');
    const tooMany = await crowded.attach('image', makeImage(600)).expect(400);
    expect(tooMany.body.message).toMatch(/File upload error: Too many/);

    let heavy = request(app).post('/rock').set(auth(admin.token));
    form({ description: undefined }).forEach(([key, value]) => { heavy = heavy.field(key, String(value)); });
    const tooLong = await heavy.field('description', 'x'.repeat(70 * 1024)).attach('image', makeImage(600)).expect(400);
    expect(tooLong.body.message).toMatch(/File upload error/);

    expect(storedSpecimenImages()).toHaveLength(before);
  });

  test('text fields have a maximum length', async () => {
    await request(app).post('/rock').set(auth(admin.token)).send(newRock({ description: 'x'.repeat(5001) })).expect(400);
    await request(app).post('/rock').set(auth(admin.token)).send(newRock({ name: 'x'.repeat(151) })).expect(400);
    await request(app).post('/rock').set(auth(admin.token)).send(newRock({ luster: 'x'.repeat(501) })).expect(400);
  });

  test('NUL characters are refused instead of reaching the database', async () => {
    await request(app).get('/rock?q=%00').expect(400);
    await request(app).get('/rock/%00').expect(400);
    await request(app).get('/specimen/%00').expect(400);
    await request(app).get('/specimen?q=a%00b').expect(400);

    await request(app).post('/rock').set(auth(admin.token)).send(newRock({ description: 'before\u0000after' })).expect(400);
    const created = await request(app).post('/rock').set(auth(admin.token)).send(newRock()).expect(201);
    await request(app).patch(`/rock/${created.body.rock.id}`).set(auth(admin.token)).send({ scientific_name: '\u0000' }).expect(400);

    const before = storedSpecimenImages().length;
    let multipart = request(app).post('/rock').set(auth(admin.token));
    form({ imgUrl: undefined, description: 'mul\u0000tipart' }).forEach(([key, value]) => { multipart = multipart.field(key, String(value)); });
    await multipart.attach('image', makeImage(600)).expect(400);
    expect(storedSpecimenImages()).toHaveLength(before);
  });

  test('a catalog index that is not a finite number finds nothing', async () => {
    await request(app).get('/rock/1e309').expect(404);
    await request(app).get('/rock/-1e309').expect(404);
    await request(app).get('/rock/NaN').expect(404);
  });
});
