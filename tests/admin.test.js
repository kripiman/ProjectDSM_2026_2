const request = require('supertest');
const { Op } = require('sequelize');
const { User, Analysis, Feedback, CollectionItem } = require('../src/models');
const { ROLE_IDS } = require('../src/config/constants');
const { createApp, auth, createGuest, registerUser, createAdmin, recognize, uniqueEmail } = require('./helpers');

const app = createApp();


const get = (token, url) => request(app).get(url).set(auth(token));
const patch = (token, url, body) => request(app).patch(url).set(auth(token)).send(body);

// Makes `keeper` the only active administrator (other tests in this file create more).
const leaveOnlyAdmin = async (keeper) => {
  await User.update({ status: 'suspended' }, { where: { role: 'admin', id: { [Op.ne]: keeper.user.id } } });
};
const reactivateAdmins = () => User.update({ status: 'active' }, { where: { role: 'admin' } });

describe('Access control of /admin', () => {
  let admin;
  let user;
  let guest;
  let target;

  beforeAll(async () => {
    admin = await createAdmin();
    user = await registerUser(app);
    guest = await createGuest(app);
    target = await registerUser(app);
  });

  const routes = () => [
    ['GET', '/admin/users'],
    ['GET', `/admin/users/${target.user.id}`],
    ['GET', `/admin/users/${target.user.id}/collection`],
    ['GET', `/admin/users/${target.user.id}/achievements`],
    ['PATCH', `/admin/users/${target.user.id}/role`, { role: 'admin' }],
    ['PATCH', `/admin/users/${target.user.id}/status`, { status: 'banned' }],
    ['GET', '/admin/stats'],
    ['GET', '/admin/history'],
    ['GET', '/admin/feedback'],
    ['GET', '/admin/achievements']
  ];

  test('every administrative route rejects anonymous callers with 401', async () => {
    for (const [method, url, body] of routes()) {
      const res = await request(app)[method.toLowerCase()](url).send(body);
      expect([method, url, res.status]).toEqual([method, url, 401]);
    }
  });

  test.each([['guest session'], ['registered user']])('every administrative route rejects a %s with 403', async (kind) => {
    const { token } = kind === 'guest session' ? guest : user;
    for (const [method, url, body] of routes()) {
      const res = await request(app)[method.toLowerCase()](url).set(auth(token)).send(body);
      expect([method, url, res.status, res.body.errorCode]).toEqual([method, url, 403, '403_FORBIDDEN']);
    }

    // Nothing was changed by the rejected attempts.
    const untouched = await User.findByPk(target.user.id);
    expect([untouched.role, untouched.status]).toEqual(['user', 'active']);
  });

  test('an administrator can use them all', async () => {
    for (const [method, url, body] of routes().filter(([m]) => m === 'GET')) {
      const res = await request(app)[method.toLowerCase()](url).set(auth(admin.token)).send(body);
      expect([method, url, res.status]).toEqual([method, url, 200]);
    }
  });

  test('a user cannot raise their own privileges', async () => {
    await patch(user.token, `/admin/users/${user.user.id}/role`, { role: 'admin' }).expect(403);
    expect((await User.findByPk(user.user.id)).role).toBe('user');
  });
});

describe('User management', () => {
  let admin;
  let alice;
  let bob;
  let guest;

  beforeAll(async () => {
    admin = await createAdmin();
    alice = await registerUser(app, { email: uniqueEmail('alice'), display_name: 'Alice Geóloga' });
    bob = await registerUser(app, { email: uniqueEmail('bob'), userName: `bob_${Date.now()}` });
    guest = await createGuest(app);

    await recognize(app, alice.token, 'quartz').expect(200);
    await recognize(app, alice.token, 'pyrite').expect(200);
  });

  // Some tests suspend administrators on purpose; always start the next one clean.
  afterEach(reactivateAdmins);

  describe('listing', () => {
    test('GET /admin/users lists registered accounts and never exposes password hashes', async () => {
      const res = await get(admin.token, '/admin/users').expect(200);
      const ids = res.body.data.users.map((u) => u.id);

      expect(ids).toEqual(expect.arrayContaining([alice.user.id, bob.user.id, admin.user.id]));
      expect(ids).not.toContain(guest.user.id); // guest sessions are not "registered users"
      res.body.data.users.forEach((u) => expect(u.is_anonymous).toBe(false));
      expect(res.body.data.pagination).toMatchObject({ page: 1, limit: 20 });
      expect(JSON.stringify(res.body)).not.toMatch(/password/i);
    });

    test('guest sessions can be listed on request', async () => {
      const all = await get(admin.token, '/admin/users?is_anonymous=all&limit=100').expect(200);
      expect(all.body.data.users.map((u) => u.id)).toContain(guest.user.id);

      const guests = await get(admin.token, '/admin/users?is_anonymous=true&limit=100').expect(200);
      expect(guests.body.data.users.length).toBeGreaterThan(0);
      guests.body.data.users.forEach((u) => expect(u.role).toBe('guest'));
    });

    test('users can be filtered by role, status and text, and paginated', async () => {
      const admins = await get(admin.token, '/admin/users?role=admin&limit=100').expect(200);
      admins.body.data.users.forEach((u) => expect(u.role).toBe('admin'));
      expect(admins.body.data.users.map((u) => u.id)).toContain(admin.user.id);

      const search = await get(admin.token, `/admin/users?q=${encodeURIComponent(alice.email.split('@')[0])}`).expect(200);
      expect(search.body.data.users.map((u) => u.id)).toEqual([alice.user.id]);

      const byName = await get(admin.token, '/admin/users?q=Geóloga').expect(200);
      expect(byName.body.data.users.map((u) => u.id)).toContain(alice.user.id);

      const small = await get(admin.token, '/admin/users?limit=2&page=1').expect(200);
      expect(small.body.data.users).toHaveLength(2);
      expect(small.body.data.pagination.total).toBeGreaterThanOrEqual(3);
      expect(small.body.data.pagination.total_pages).toBeGreaterThanOrEqual(2);

      const suspended = await get(admin.token, '/admin/users?status=suspended').expect(200);
      suspended.body.data.users.forEach((u) => expect(u.status).toBe('suspended'));
    });

    test('malformed filters are rejected', async () => {
      for (const query of ['role=emperor', 'status=asleep', 'limit=abc', 'page=0', 'is_anonymous=maybe', 'limit=0']) {
        await get(admin.token, `/admin/users?${query}`).expect(400);
      }
    });

    test('an oversized page size is reduced to the maximum instead of being refused', async () => {
      const res = await get(admin.token, '/admin/users?limit=5000').expect(200);
      expect(res.body.data.pagination.limit).toBe(100);
    });
  });

  describe('details', () => {
    test("GET /admin/users/:id shows the user's profile, progress, collection and achievements", async () => {
      const res = await get(admin.token, `/admin/users/${alice.user.id}`).expect(200);
      const data = res.body.data;

      expect(data.user).toMatchObject({ id: alice.user.id, email: alice.email, role: 'user', status: 'active' });
      expect(data.progress).toMatchObject({ total_discovered: 2, total_recognitions: 2 });
      expect(data.collection.map((item) => item.specimen.id).sort()).toEqual(['pyrite', 'quartz']);
      expect(data.achievements.unlocked.map((a) => a.code)).toContain('FIRST_SCAN');
      expect(data.achievements.locked.map((a) => a.code)).toContain('MINERAL_EXPERT');
      expect(JSON.stringify(res.body)).not.toMatch(/password/i);

      await get(admin.token, '/admin/users/missing-user').expect(404);
    });

    test("GET /admin/users/:id/collection lists what the user discovered", async () => {
      const res = await get(admin.token, `/admin/users/${alice.user.id}/collection`).expect(200);
      expect(res.body.data.total_discovered).toBe(2);
      expect(res.body.data.collection.every((item) => item.user_id === alice.user.id)).toBe(true);

      const empty = await get(admin.token, `/admin/users/${bob.user.id}/collection`).expect(200);
      expect(empty.body.data.collection).toEqual([]);
      await get(admin.token, '/admin/users/missing-user/collection').expect(404);
    });

    test("GET /admin/users/:id/achievements lists the user's unlocked and locked achievements", async () => {
      const res = await get(admin.token, `/admin/users/${alice.user.id}/achievements`).expect(200);
      expect(res.body.data.unlocked.map((a) => a.code)).toEqual(['FIRST_SCAN']);
      expect(res.body.data.unlocked[0].unlocked_at).toBeTruthy();
      expect(res.body.data.locked.length).toBeGreaterThanOrEqual(5);
      await get(admin.token, '/admin/users/missing-user/achievements').expect(404);
    });
  });

  describe('roles', () => {
    test('PATCH /admin/users/:id/role promotes a user, effective immediately, and demotes them again', async () => {
      const promotee = await registerUser(app);
      await get(promotee.token, '/admin/stats').expect(403);

      const res = await patch(admin.token, `/admin/users/${promotee.user.id}/role`, { role: 'admin' }).expect(200);
      expect(res.body.data).toMatchObject({ id: promotee.user.id, role: 'admin' });

      const stored = await User.findByPk(promotee.user.id);
      expect([stored.role, stored.role_id]).toEqual(['admin', ROLE_IDS.admin]);
      // The token issued while they were a regular user now opens the admin area.
      await get(promotee.token, '/admin/stats').expect(200);

      await patch(admin.token, `/admin/users/${promotee.user.id}/role`, { role: 'user' }).expect(200);
      const demoted = await User.findByPk(promotee.user.id);
      expect([demoted.role, demoted.role_id]).toEqual(['user', ROLE_IDS.user]);
      await get(promotee.token, '/admin/stats').expect(403);
    });

    test('only user and admin can be assigned', async () => {
      const subject = await registerUser(app);
      for (const role of ['guest', 'superuser', '', undefined, 3]) {
        await patch(admin.token, `/admin/users/${subject.user.id}/role`, { role }).expect(400);
      }
      await patch(admin.token, `/admin/users/${subject.user.id}/role`, {}).expect(400);
      expect((await User.findByPk(subject.user.id)).role).toBe('user');
    });

    test('guest sessions have no role to change', async () => {
      const res = await patch(admin.token, `/admin/users/${guest.user.id}/role`, { role: 'admin' }).expect(400);
      expect(res.body.message).toMatch(/Guest sessions/);
      expect((await User.findByPk(guest.user.id)).role).toBe('guest');
    });

    test('unknown users are 404', async () => {
      await patch(admin.token, '/admin/users/missing-user/role', { role: 'user' }).expect(404);
    });

    test('the last active administrator cannot be demoted; with another active one it can', async () => {
      const last = await createAdmin();
      await leaveOnlyAdmin(last);

      const res = await patch(last.token, `/admin/users/${last.user.id}/role`, { role: 'user' }).expect(409);
      expect(res.body.message).toMatch(/last active administrator/);
      expect((await User.findByPk(last.user.id)).role).toBe('admin');

      const second = await createAdmin();
      await patch(last.token, `/admin/users/${last.user.id}/role`, { role: 'user' }).expect(200);
      expect((await User.findByPk(last.user.id)).role).toBe('user');
      expect((await User.findByPk(second.user.id)).role).toBe('admin');

      await reactivateAdmins();
    });

    test('two administrators demoting each other at the same time cannot leave the platform without one', async () => {
      const first = await createAdmin();
      const second = await createAdmin();
      await User.update({ status: 'suspended' }, { where: { role: 'admin', id: { [Op.notIn]: [first.user.id, second.user.id] } } });

      const results = await Promise.all([
        patch(first.token, `/admin/users/${second.user.id}/role`, { role: 'user' }),
        patch(second.token, `/admin/users/${first.user.id}/role`, { role: 'user' })
      ]);

      // One request wins. The other is refused: by the transaction guard (409) or, if
      // the winner had already finished, because its author lost the admin role (403).
      const statuses = results.map((res) => res.status).sort();
      expect(statuses[0]).toBe(200);
      expect([403, 409]).toContain(statuses[1]);
      const active = await User.count({ where: { role: 'admin', status: 'active' } });
      expect(active).toBe(1);

      await reactivateAdmins();
    });
  });

  describe('account status', () => {
    test('PATCH /admin/users/:id/status suspends, bans and reactivates accounts', async () => {
      const subject = await registerUser(app);
      await get(subject.token, '/user/profile').expect(200);

      for (const status of ['suspended', 'banned']) {
        const res = await patch(admin.token, `/admin/users/${subject.user.id}/status`, { status }).expect(200);
        expect(res.body.data.status).toBe(status);
        // Sessions end at once, and signing in is refused.
        await get(subject.token, '/user/profile').expect(401);
        await request(app).post('/auth/login').send({ email: subject.email, password: subject.password }).expect(403);
      }

      await patch(admin.token, `/admin/users/${subject.user.id}/status`, { status: 'active' }).expect(200);
      // Reactivating does not revive the old session: the user signs in again.
      await get(subject.token, '/user/profile').expect(401);
      const login = await request(app).post('/auth/login').send({ email: subject.email, password: subject.password }).expect(200);
      await get(login.body.data.token, '/user/profile').expect(200);
    });

    test('status values are validated and unknown users are 404', async () => {
      const subject = await registerUser(app);
      for (const status of ['deleted', '', undefined, 1]) {
        await patch(admin.token, `/admin/users/${subject.user.id}/status`, { status }).expect(400);
      }
      await patch(admin.token, '/admin/users/missing-user/status', { status: 'banned' }).expect(404);
      expect((await User.findByPk(subject.user.id)).status).toBe('active');
    });

    test('the last active administrator cannot be suspended, not even by themselves', async () => {
      const last = await createAdmin();
      await leaveOnlyAdmin(last);

      const res = await patch(last.token, `/admin/users/${last.user.id}/status`, { status: 'suspended' }).expect(409);
      expect(res.body.message).toMatch(/last active administrator/);
      expect((await User.findByPk(last.user.id)).status).toBe('active');

      await reactivateAdmins();
    });

    test('a suspended administrator is locked out of the admin area', async () => {
      const other = await createAdmin();
      await patch(admin.token, `/admin/users/${other.user.id}/status`, { status: 'suspended' }).expect(200);
      await get(other.token, '/admin/stats').expect(401);
      await reactivateAdmins();
    });
  });
});

describe('Platform statistics', () => {
  let admin;

  beforeAll(async () => {
    admin = await createAdmin();
  });

  test('GET /admin/stats reports users, recognitions and the most recognized rocks', async () => {
    const before = (await get(admin.token, '/admin/stats').expect(200)).body.data;
    const quartzBefore = (before.most_recognized_rocks.find((r) => r.specimen_id === 'quartz') || { recognitions: 0 }).recognitions;

    const user = await registerUser(app);
    const guest = await createGuest(app);
    for (const variant of ['quartz', 'quartz', 'quartz', 'pyrite', 'basalt']) {
      await recognize(app, user.token, variant).expect(200);
    }
    await recognize(app, guest.token, 'quartz').expect(200);

    const after = (await get(admin.token, '/admin/stats?top=50').expect(200)).body.data;

    expect(after.total_registered_users).toBe(before.total_registered_users + 1);
    expect(after.guest_sessions).toBe(before.guest_sessions + 1);
    expect(after.total_recognitions).toBe(before.total_recognitions + 6);
    expect(after.total_recognitions).toBe(await Analysis.count());
    expect(after.total_discoveries).toBe(await CollectionItem.count());
    expect(after.users_by_role).toMatchObject({ admin: expect.any(Number), user: expect.any(Number) });
    expect(after.catalog_size).toBeGreaterThanOrEqual(12);

    const ranking = after.most_recognized_rocks;
    const quartz = ranking.find((r) => r.specimen_id === 'quartz');
    expect(quartz).toMatchObject({ name_es: 'Cuarzo', category: 'mineral', recognitions: quartzBefore + 4 });
    expect(quartz.percentage).toBeCloseTo((quartz.recognitions / after.total_recognitions) * 100, 1);

    // Sorted from the most to the least recognized.
    const counts = ranking.map((r) => r.recognitions);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
    expect(ranking[0].specimen_id).toBe('quartz');
    expect(ranking.reduce((sum, r) => sum + r.recognitions, 0)).toBe(after.total_recognitions);
  });

  test('the size of the ranking can be chosen', async () => {
    const res = await get(admin.token, '/admin/stats?top=1').expect(200);
    expect(res.body.data.most_recognized_rocks).toHaveLength(1);

    const fallback = await get(admin.token, '/admin/stats').expect(200);
    expect(fallback.body.data.most_recognized_rocks.length).toBeLessThanOrEqual(5);

    await get(admin.token, '/admin/stats?top=0').expect(400);
    await get(admin.token, '/admin/stats?top=abc').expect(400);
  });

  test('active and suspended accounts are told apart', async () => {
    const before = (await get(admin.token, '/admin/stats').expect(200)).body.data;
    const victim = await registerUser(app);
    await patch(admin.token, `/admin/users/${victim.user.id}/status`, { status: 'suspended' }).expect(200);

    const after = (await get(admin.token, '/admin/stats').expect(200)).body.data;
    expect(after.total_registered_users).toBe(before.total_registered_users + 1);
    expect(after.active_registered_users).toBe(before.active_registered_users);
    expect(after.suspended_users).toBe(before.suspended_users + 1);
  });

  test('feedback accuracy and achievement figures are included', async () => {
    const user = await registerUser(app);
    const ratings = ['correct', 'correct', 'correct', 'incorrect', 'uncertain'];
    for (const rating of ratings) {
      const recognition = await recognize(app, user.token, 'quartz').expect(200);
      await request(app)
        .post(`/feedback/analysis/${recognition.body.data.analysis_id}`)
        .set(auth(user.token))
        .send({ rating })
        .expect(201);
    }

    const stats = (await get(admin.token, '/admin/stats').expect(200)).body.data;
    const correct = await Feedback.count({ where: { rating: 'correct' } });
    const incorrect = await Feedback.count({ where: { rating: 'incorrect' } });

    expect(stats.feedback).toMatchObject({
      correct,
      incorrect,
      uncertain: await Feedback.count({ where: { rating: 'uncertain' } }),
      total: await Feedback.count()
    });
    expect(stats.feedback.accuracy_rate).toBeCloseTo((correct / (correct + incorrect)) * 100, 1);
    expect(stats.achievements.defined).toBeGreaterThanOrEqual(6);
    expect(stats.achievements.unlocked_total).toBeGreaterThan(0);
  });
});

describe('Activity supervision', () => {
  let admin;
  let ana;
  let luis;

  beforeAll(async () => {
    admin = await createAdmin();
    ana = await registerUser(app);
    luis = await registerUser(app);

    await recognize(app, ana.token, 'quartz').expect(200);
    await recognize(app, ana.token, 'pyrite').expect(200);
    await recognize(app, luis.token, 'quartz').expect(200);
  });

  describe('recognition history', () => {
    test('GET /admin/history lists recognitions newest first, with who made them', async () => {
      const res = await get(admin.token, '/admin/history?limit=100').expect(200);
      const entries = res.body.data.recognitions;

      expect(entries.length).toBeGreaterThanOrEqual(3);
      expect(res.body.data.pagination.total).toBe(await Analysis.count());
      const times = entries.map((entry) => new Date(entry.createdAt).getTime());
      expect(times).toEqual([...times].sort((a, b) => b - a));

      const mine = entries.find((entry) => entry.user_id === ana.user.id);
      expect(mine.user).toMatchObject({ id: ana.user.id, email: ana.email, role: 'user' });
      expect(mine.primary_specimen).toHaveProperty('name_es');
      expect(mine.raw_ai_response).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toMatch(/password/i);
    });

    test('it can be filtered by user, specimen and date', async () => {
      const byUser = await get(admin.token, `/admin/history?user_id=${ana.user.id}`).expect(200);
      expect(byUser.body.data.recognitions).toHaveLength(2);
      byUser.body.data.recognitions.forEach((entry) => expect(entry.user_id).toBe(ana.user.id));

      const bySpecimen = await get(admin.token, `/admin/history?user_id=${luis.user.id}&specimen_id=quartz`).expect(200);
      expect(bySpecimen.body.data.recognitions).toHaveLength(1);
      const none = await get(admin.token, `/admin/history?user_id=${luis.user.id}&specimen_id=pyrite`).expect(200);
      expect(none.body.data.recognitions).toHaveLength(0);

      const future = new Date(Date.now() + 86400000).toISOString();
      const past = new Date(Date.now() - 86400000).toISOString();
      const later = await get(admin.token, `/admin/history?from=${encodeURIComponent(future)}`).expect(200);
      expect(later.body.data.recognitions).toHaveLength(0);
      const inRange = await get(admin.token, `/admin/history?user_id=${ana.user.id}&from=${encodeURIComponent(past)}&to=${encodeURIComponent(future)}`).expect(200);
      expect(inRange.body.data.recognitions).toHaveLength(2);
    });

    test('it is paginated and validates its parameters', async () => {
      const page = await get(admin.token, `/admin/history?user_id=${ana.user.id}&limit=1&page=2`).expect(200);
      expect(page.body.data.recognitions).toHaveLength(1);
      expect(page.body.data.pagination).toMatchObject({ page: 2, limit: 1, total: 2, total_pages: 2 });

      for (const query of ['from=yesterday', 'limit=abc', 'status=imaginary', 'page=-1']) {
        await get(admin.token, `/admin/history?${query}`).expect(400);
      }
    });
  });

  describe('feedback from users', () => {
    let analysisIds;

    beforeAll(async () => {
      analysisIds = [];
      for (const [person, rating] of [[ana, 'correct'], [luis, 'incorrect']]) {
        const recognition = await recognize(app, person.token, 'basalt').expect(200);
        analysisIds.push(recognition.body.data.analysis_id);
        await request(app)
          .post(`/feedback/analysis/${recognition.body.data.analysis_id}`)
          .set(auth(person.token))
          .send({ rating, comments: `Comentario de ${rating}`, ...(rating === 'incorrect' && { suggested_specimen_id: 'granite' }) })
          .expect(201);
      }
    });

    test('GET /admin/feedback lists every evaluation with its author and recognition', async () => {
      const res = await get(admin.token, '/admin/feedback?limit=100').expect(200);
      const entries = res.body.data.feedback;

      expect(res.body.data.pagination.total).toBe(await Feedback.count());
      const incorrect = entries.find((entry) => entry.analysis_id === analysisIds[1]);
      expect(incorrect).toMatchObject({ rating: 'incorrect', comments: 'Comentario de incorrect' });
      expect(incorrect.user).toMatchObject({ id: luis.user.id, email: luis.email });
      expect(incorrect.analysis.primary_specimen).toHaveProperty('name_es');
      expect(incorrect.suggested_specimen).toMatchObject({ id: 'granite' });
      expect(JSON.stringify(res.body)).not.toMatch(/password/i);
    });

    test('it can be filtered by rating and by user', async () => {
      const wrong = await get(admin.token, '/admin/feedback?rating=incorrect').expect(200);
      expect(wrong.body.data.feedback.length).toBeGreaterThan(0);
      wrong.body.data.feedback.forEach((entry) => expect(entry.rating).toBe('incorrect'));

      const mine = await get(admin.token, `/admin/feedback?user_id=${ana.user.id}`).expect(200);
      mine.body.data.feedback.forEach((entry) => expect(entry.user_id).toBe(ana.user.id));

      await get(admin.token, '/admin/feedback?rating=meh').expect(400);
    });
  });
});
