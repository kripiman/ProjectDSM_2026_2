const request = require('supertest');
const Server = require('../src/utils/server');
const { generateToken, verifyToken, extractTokenFromHeader } = require('../src/services/token.service');
const { Specimen, Category, Type, Role } = require('../src/models');

const server = new Server();
const app = server.app;

describe('Classroom Compatibility & Rock CRUD APIs (/api/rock, /api/user)', () => {
  let createdRockId = '';

  test('Token Service - should generate, verify and extract JWT tokens', () => {
    const token = generateToken('user-123', 'user', false);
    expect(typeof token).toBe('string');

    const decoded = verifyToken(token);
    expect(decoded.userId).toBe('user-123');
    expect(decoded.role).toBe('user');

    const extracted = extractTokenFromHeader(`Bearer ${token}`);
    expect(extracted).toBe(token);

    expect(extractTokenFromHeader(undefined)).toBeNull();
    expect(extractTokenFromHeader('Basic 123')).toBeNull();
  });

  test('POST /api/rock/agregar - Should create rock with float physical properties and associations', async () => {
    const timestamp = Date.now();
    const res = await request(app)
      .post('/api/rock/agregar')
      .send({
        name: `Obsidiana Negra ${timestamp}`,
        scientificName: `Obsidianus Volcanicus ${timestamp}`,
        index: timestamp % 100000,
        typeId: 1,
        categoryId: 2,
        hardness: 5.5,
        density: 2.35,
        transparency: 0.15, // Float as requested
        tenacity: 2.5,      // Float as requested
        molarWeight: 60.08,
        description: 'Vidrio volcánico natural',
        composition: 'SiO2 con inclusiones de óxidos de hierro',
        commonUses: 'Herramientas de corte, joyería y decoración'
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.rock).toBeDefined();
    expect(res.body.rock.transparency).toBe(0.15);
    expect(res.body.rock.tenacity).toBe(2.5);
    expect(res.body.rock.density).toBe(2.35);
    expect(res.body.rock.is_deleted).toBe(false);

    createdRockId = res.body.rock.id;
  });

  test('GET /api/rock - Should list active rocks including category and type relations', async () => {
    const res = await request(app)
      .get('/api/rock')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.rocks)).toBe(true);
    expect(res.body.rocks.length).toBeGreaterThanOrEqual(1);

    const created = res.body.rocks.find(r => r.id === createdRockId);
    expect(created).toBeDefined();
  });

  test('GET /api/rock/:id - Should retrieve rock by ID', async () => {
    const res = await request(app)
      .get(`/api/rock/${createdRockId}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.rock.id).toBe(createdRockId);
  });

  test('PATCH /api/rock/actualizar/:id - Should update rock fields', async () => {
    const res = await request(app)
      .patch(`/api/rock/actualizar/${createdRockId}`)
      .send({
        description: 'Descripción actualizada de obsidiana',
        density: 2.40
      })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.rock.description).toBe('Descripción actualizada de obsidiana');
    expect(res.body.rock.density).toBe(2.40);
  });

  test('DELETE /api/rock/eliminar/:id - Should execute dual soft delete (date + boolean)', async () => {
    const res = await request(app)
      .delete(`/api/rock/eliminar/${createdRockId}`)
      .expect(200);

    expect(res.body.success).toBe(true);

    // Verify rock is excluded from active listings
    const listRes = await request(app)
      .get('/api/rock')
      .expect(200);

    const foundInActive = listRes.body.rocks.find(r => r.id === createdRockId);
    expect(foundInActive).toBeUndefined();

    // Verify in raw DB that is_deleted=true and deleted_at is set
    const rawRecord = await Specimen.findOne({
      where: { id: createdRockId },
      paranoid: false
    });
    expect(rawRecord).toBeDefined();
    expect(rawRecord.is_deleted).toBe(true);
    expect(rawRecord.deleted_at).not.toBeNull();
  });

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
