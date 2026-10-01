const bcrypt = require('bcryptjs');
const request = require('supertest');
const env = require('../src/config/env');
const { AttemptLimiter } = require('../src/utils/attempt_limiter');
const { loginAttempts } = require('../src/middlewares/login_limit.middleware');
const { User } = require('../src/models');
const { createApp, registerUser, uniqueEmail } = require('./helpers');

const MINUTE = 60 * 1000;

describe('AttemptLimiter', () => {
  let now;
  const create = (options = {}) => new AttemptLimiter({ maxAttempts: 3, lockMs: 15 * MINUTE, now: () => now, ...options });
  const use = (limiter, key, times = 1) => Array.from({ length: times }, () => limiter.consume(key));
  const allAllowed = (outcomes) => outcomes.every((outcome) => outcome.allowed);

  beforeEach(() => {
    now = 1_000_000;
  });

  test('allows the configured number of attempts and then blocks the key', () => {
    const limiter = create();

    expect(use(limiter, 'a', 3)).toEqual([{ allowed: true }, { allowed: true }, { allowed: true }]);
    expect(limiter.consume('a')).toEqual({ allowed: false, retryAfterMs: 15 * MINUTE });
  });

  test('the block counts down and ends once the lock time has passed', () => {
    const limiter = create();
    use(limiter, 'a', 3);

    now += 5 * MINUTE;
    expect(limiter.consume('a')).toEqual({ allowed: false, retryAfterMs: 10 * MINUTE });

    now += 10 * MINUTE;
    expect(allAllowed(use(limiter, 'a', 3))).toBe(true); // a whole new budget
    expect(limiter.consume('a').allowed).toBe(false);
  });

  test('a refused attempt does not extend the block', () => {
    const limiter = create();
    use(limiter, 'a', 3);

    now += 10 * MINUTE;
    expect(limiter.consume('a').allowed).toBe(false);
    now += 5 * MINUTE; // 15 minutes after the last allowed attempt, not after the refused one
    expect(limiter.consume('a').allowed).toBe(true);
  });

  test('every allowed attempt keeps the count alive for another lock time', () => {
    const limiter = create();
    limiter.consume('a');
    now += 10 * MINUTE;
    limiter.consume('a');
    now += 10 * MINUTE; // the first attempt is 20 minutes old, the second only 10

    expect(limiter.consume('a').allowed).toBe(true); // third
    expect(limiter.consume('a').allowed).toBe(false); // fourth: nothing was forgotten
  });

  test('attempts that are not used up are forgotten once a whole lock time passes quietly', () => {
    const limiter = create();
    use(limiter, 'a', 2);
    now += 15 * MINUTE;

    expect(allAllowed(use(limiter, 'a', 3))).toBe(true);
    expect(limiter.consume('a').allowed).toBe(false);
  });

  test('keys are independent of each other', () => {
    const limiter = create();
    use(limiter, 'a', 3);

    expect(limiter.consume('a').allowed).toBe(false);
    expect(limiter.consume('b').allowed).toBe(true);
  });

  test('clear() starts a key over', () => {
    const limiter = create();
    use(limiter, 'a', 2);
    limiter.clear('a');

    expect(allAllowed(use(limiter, 'a', 3))).toBe(true);
    expect(limiter.consume('a').allowed).toBe(false);
  });

  test('refund() gives one attempt back, and is harmless for an unknown key', () => {
    const limiter = create();
    use(limiter, 'a', 3);
    limiter.refund('a');
    limiter.refund('never seen');

    expect(limiter.consume('a').allowed).toBe(true);
    expect(limiter.consume('a').allowed).toBe(false);
  });

  test('reset() forgets every key', () => {
    const limiter = create();
    use(limiter, 'a', 3);
    limiter.reset();

    expect(allAllowed(use(limiter, 'a', 3))).toBe(true);
  });

  describe('when more keys than it can remember arrive', () => {
    test('keys whose time ran out are forgotten first', () => {
      const limiter = create({ maxEntries: 2 });
      limiter.consume('stale');
      now += 15 * MINUTE;
      use(limiter, 'blocked', 3);

      limiter.consume('newcomer'); // no room: the stale key goes

      expect(limiter.consume('blocked').allowed).toBe(false);
      expect(allAllowed(use(limiter, 'newcomer', 2))).toBe(true); // it was remembered: this is its third attempt
      expect(limiter.consume('newcomer').allowed).toBe(false);
    });

    test('a blocked key is not freed by flooding with other keys', () => {
      const limiter = create({ maxEntries: 3 });
      use(limiter, 'victim', 3);

      for (let junk = 0; junk < 20; junk += 1) {
        limiter.consume(`junk ${junk}`);
      }

      expect(limiter.consume('victim').allowed).toBe(false);
    });

    test('when every key is blocked the oldest goes, never the one that just arrived', () => {
      const limiter = create({ maxEntries: 2 });
      use(limiter, 'a', 3);
      use(limiter, 'b', 3);

      limiter.consume('c');

      expect(limiter.consume('b').allowed).toBe(false);
      expect(allAllowed(use(limiter, 'c', 2))).toBe(true); // c was remembered
      expect(limiter.consume('c').allowed).toBe(false);
      expect(limiter.consume('a').allowed).toBe(true); // a was the one forgotten
    });

    test('a key that is still being used outlasts idle ones', () => {
      const limiter = create({ maxEntries: 2 });
      limiter.consume('a');
      limiter.consume('b');
      limiter.consume('a'); // used again: now the most recent

      limiter.consume('c'); // no room: b, the oldest, goes

      expect(limiter.consume('a').allowed).toBe(true); // its third attempt: the count was kept
      expect(limiter.consume('a').allowed).toBe(false);
    });
  });
});

describe('Login attempts', () => {
  const realClock = loginAttempts.now;

  // The tests play different client addresses through X-Forwarded-For, as behind a proxy.
  const createAppBehindProxy = () => {
    const configured = env.TRUST_PROXY;
    env.TRUST_PROXY = true;
    try {
      return createApp();
    } finally {
      env.TRUST_PROXY = configured;
    }
  };
  const app = createAppBehindProxy();

  const attempt = (email, password, address = '10.0.0.1') => request(app)
    .post('/auth/login')
    .set('X-Forwarded-For', address)
    .send({ email, password });
  const failLogins = async (email, count = 3, address) => {
    for (let attemptNumber = 1; attemptNumber <= count; attemptNumber += 1) {
      await attempt(email, 'wrong-password', address).expect(401);
    }
  };

  beforeEach(() => {
    loginAttempts.reset();
  });

  afterEach(() => {
    loginAttempts.now = realClock;
    jest.restoreAllMocks();
  });

  test('the 4th failed attempt is refused with 429, a Retry-After header and the details to tell the user', async () => {
    const user = await registerUser(app);
    await failLogins(user.email);

    const blocked = await attempt(user.email, 'wrong-password').expect(429);

    expect(blocked.body).toMatchObject({
      success: false,
      statusCode: 429,
      errorCode: 'TOO_MANY_LOGIN_ATTEMPTS',
      details: { max_attempts: 3 }
    });
    expect(blocked.body.message).toMatch(/Too many failed login attempts.*15 minute/);
    const retryAfter = Number(blocked.headers['retry-after']);
    expect(retryAfter).toBeGreaterThan(14 * 60);
    expect(retryAfter).toBeLessThanOrEqual(15 * 60);
    expect(blocked.body.details.retry_after_seconds).toBe(retryAfter);
  });

  test('while blocked even the right password is refused', async () => {
    const user = await registerUser(app);
    await failLogins(user.email);

    await attempt(user.email, user.password).expect(429);
  });

  test('an email that does not exist is counted and blocked exactly like one that does', async () => {
    const user = await registerUser(app);
    const ghost = uniqueEmail('ghost');

    const refusals = [];
    for (const email of [user.email, ghost]) {
      await failLogins(email);
      const refused = await attempt(email, 'wrong-password').expect(429);
      refusals.push({ ...refused.body, details: { ...refused.body.details, retry_after_seconds: undefined } });
    }
    expect(refusals[1]).toEqual(refusals[0]);
  });

  test('an unknown email still has a password checked against a hash, so answering takes as long', async () => {
    const user = await registerUser(app);
    const compare = jest.spyOn(bcrypt, 'compare');

    await attempt(uniqueEmail('ghost'), 'wrong-password').expect(401);
    expect(compare).toHaveBeenCalledTimes(1);
    expect(compare).toHaveBeenLastCalledWith('wrong-password', expect.stringMatching(/^\$2[aby]\$\d\d\$/));

    await attempt(user.email, 'wrong-password').expect(401);
    expect(compare).toHaveBeenCalledTimes(2);
  });

  test('a successful login starts the count over', async () => {
    const user = await registerUser(app);

    await failLogins(user.email, 2);
    await attempt(user.email, user.password).expect(200);

    await failLogins(user.email);
    await attempt(user.email, user.password).expect(429);
  });

  test('the right password on the last allowed attempt still logs in', async () => {
    const user = await registerUser(app);
    await failLogins(user.email, 2);

    const login = await attempt(user.email, user.password).expect(200);
    expect(login.body.data.token).toBeDefined();
  });

  test('every spelling of an email shares one counter', async () => {
    const user = await registerUser(app);

    await attempt(user.email.toUpperCase(), 'wrong-password').expect(401);
    await attempt(` ${user.email} `, 'wrong-password').expect(401);
    await attempt(user.email, 'wrong-password').expect(401);

    await attempt(user.email.toUpperCase(), user.password).expect(429);
  });

  test('other emails and other client addresses are not affected', async () => {
    const user = await registerUser(app);
    const other = await registerUser(app);
    await failLogins(user.email, 3, '10.0.0.1');
    await attempt(user.email, 'wrong-password', '10.0.0.1').expect(429);

    await attempt(other.email, other.password, '10.0.0.1').expect(200); // same address, another account
    await attempt(user.email, user.password, '10.0.0.2').expect(200); // same account, another address
  });

  test('the classroom alias of the login route shares the same counter', async () => {
    const user = await registerUser(app);
    const viaAlias = (password) => request(app).post('/api/user/login').set('X-Forwarded-For', '10.0.0.1').send({ email: user.email, password });
    await failLogins(user.email, 2);
    await viaAlias('wrong-password').expect(401);

    await attempt(user.email, 'wrong-password').expect(429);
    await viaAlias(user.password).expect(429);
  });

  test('simultaneous attempts cannot get past the limit', async () => {
    const user = await registerUser(app);

    const responses = await Promise.all(Array.from({ length: 10 }, () => attempt(user.email, 'wrong-password')));

    expect(responses.map((res) => res.status).sort()).toEqual([401, 401, 401, 429, 429, 429, 429, 429, 429, 429]);
  });

  test('requests rejected before the credentials are checked cost nothing', async () => {
    const user = await registerUser(app);
    const tooLong = `${'a'.repeat(250)}@example.com`;
    for (let count = 1; count <= 10; count += 1) {
      await request(app).post('/auth/login').set('X-Forwarded-For', '10.0.0.1').send({ email: user.email }).expect(400);
      await request(app).post('/auth/login').set('X-Forwarded-For', '10.0.0.1').send({ email: 'not-an-email', password: 'x' }).expect(400);
      await request(app).post('/auth/login').set('X-Forwarded-For', '10.0.0.1').send({ email: tooLong, password: 'x' }).expect(400);
    }

    await failLogins(user.email);
    await attempt(user.email, 'wrong-password').expect(429);
  });

  test('the limiter keeps a digest of the client and email, never the email itself', async () => {
    const user = await registerUser(app);
    await failLogins(user.email, 1);

    const keys = [...loginAttempts.entries.keys()];
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(keys[0]).not.toContain(user.email);
  });

  test('an account that is not active is answered with 403 and the attempt is given back', async () => {
    const user = await registerUser(app);
    await User.update({ status: 'suspended' }, { where: { id: user.user.id } });

    for (let count = 1; count <= 6; count += 1) {
      await attempt(user.email, user.password).expect(403); // right password, blocked account
    }
    await failLogins(user.email);
    await attempt(user.email, 'wrong-password').expect(429);
  });

  describe('as time goes by', () => {
    let current;
    const start = 5_000_000;

    beforeEach(() => {
      current = start;
      loginAttempts.now = () => current;
    });

    test('the block ends after the lock time and the user can log in again', async () => {
      const user = await registerUser(app);
      await failLogins(user.email);
      await attempt(user.email, user.password).expect(429);

      current = start + 15 * MINUTE - 1000;
      const almost = await attempt(user.email, user.password).expect(429);
      expect(almost.headers['retry-after']).toBe('1');

      current = start + 15 * MINUTE;
      await attempt(user.email, user.password).expect(200);
    });

    test('Retry-After rounds up, so nobody is told to come back too early', async () => {
      const user = await registerUser(app);
      await failLogins(user.email);

      current = start + 15 * MINUTE - 1500; // 1.5 seconds left
      const refused = await attempt(user.email, user.password).expect(429);

      expect(refused.headers['retry-after']).toBe('2');
      expect(refused.body.details.retry_after_seconds).toBe(2);
    });
  });
});

describe('The client address', () => {
  const email = uniqueEmail('proxy');
  const configured = env.TRUST_PROXY;

  beforeAll(async () => {
    await registerUser(createApp(), { email });
  });

  beforeEach(() => {
    loginAttempts.reset();
  });

  afterEach(() => {
    env.TRUST_PROXY = configured;
  });

  test('is the one of the connection unless a proxy is configured: X-Forwarded-For cannot be used to pick another', async () => {
    const direct = createApp(); // TRUST_PROXY is off
    for (const address of ['10.0.0.1', '10.0.0.2', '10.0.0.3']) {
      await request(direct).post('/auth/login').set('X-Forwarded-For', address).send({ email, password: 'wrong-password' }).expect(401);
    }

    await request(direct).post('/auth/login').set('X-Forwarded-For', '10.0.0.4').send({ email, password: 'wrong-password' }).expect(429);
  });

  test('is read from X-Forwarded-For once the proxy is trusted', async () => {
    env.TRUST_PROXY = 1;
    const behindProxy = createApp();
    for (const address of ['10.0.0.1', '10.0.0.2', '10.0.0.3', '10.0.0.4']) {
      await request(behindProxy).post('/auth/login').set('X-Forwarded-For', address).send({ email, password: 'wrong-password' }).expect(401);
    }
  });

  test('the trust proxy setting of the application follows TRUST_PROXY', () => {
    for (const value of [false, true, 1, 'loopback']) {
      env.TRUST_PROXY = value;
      expect(createApp().get('trust proxy')).toBe(value);
    }
  });
});
