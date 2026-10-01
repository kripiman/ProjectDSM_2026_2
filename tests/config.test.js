const fs = require('fs');
const path = require('path');
const { EXAMPLE_JWT_SECRET, EXAMPLE_ADMIN_PASSWORD } = require('../src/config/example_values');

const ROOT = path.resolve(__dirname, '..');

// Every variable src/config/env.js reads: they are all cleared before each load so
// the result depends only on what the test sets.
const ENV_SOURCE = fs.readFileSync(path.join(ROOT, 'src/config/env.js'), 'utf8');
const ENV_KEYS = [...new Set([...ENV_SOURCE.matchAll(/process\.env\.([A-Z_]+)/g)].map((match) => match[1]))];

/**
 * Loads src/config/env.js in isolation with a controlled process.env (and without
 * reading the developer's .env file).
 */
const loadEnv = (variables) => {
  const saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  ENV_KEYS.forEach((key) => delete process.env[key]);
  Object.assign(process.env, variables);

  try {
    let loaded;
    jest.isolateModules(() => {
      jest.doMock('dotenv', () => ({ config: () => ({}) }));
      loaded = require('../src/config/env');
    });
    return loaded;
  } finally {
    ENV_KEYS.forEach((key) => {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    });
  }
};

const parseEnvFile = (file) => Object.fromEntries(
  fs.readFileSync(file, 'utf8')
    .split('\n')
    .map((line) => line.match(/^\s*#?\s*([A-Z_]+)=(.*)$/))
    .filter(Boolean)
    .map((match) => [match[1], match[2].trim()])
);

describe('Configuration', () => {
  test('knows the variables it reads', () => {
    expect(ENV_KEYS).toEqual(expect.arrayContaining(['NODE_ENV', 'JWT_SECRET', 'ADMIN_PASSWORD', 'DATABASE_STORAGE']));
  });

  test('the test environment is isolated from the developer configuration', () => {
    // Pinned by tests/setup.js whatever the .env file contains.
    expect(process.env.NODE_ENV).toBe('test');
    expect(path.resolve(process.env.DATABASE_STORAGE)).toContain(require('os').tmpdir());
    for (const key of ['ADMIN_EMAIL', 'ADMIN_PASSWORD', 'GEODEX_API_KEY', 'ML_SERVER_URL', 'OPENAI_API_KEY']) {
      expect([key, process.env[key]]).toEqual([key, '']);
    }
  });
});

describe('JWT secret', () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

  afterAll(() => warn.mockRestore());

  test('the source code does not contain a built-in secret', () => {
    expect(ENV_SOURCE).not.toMatch(/default_jwt_secret/i);
    expect(ENV_SOURCE).not.toMatch(/JWT_SECRET:\s*process\.env\.JWT_SECRET\s*\|\|\s*['"`]/);
  });

  test('a configured secret is used as is', () => {
    const env = loadEnv({ NODE_ENV: 'development', JWT_SECRET: 'my-own-secret' });
    expect(env.JWT_SECRET).toBe('my-own-secret');
  });

  test('outside production a missing secret is replaced by a random one, different on every start', () => {
    const first = loadEnv({ NODE_ENV: 'development' }).JWT_SECRET;
    const second = loadEnv({ NODE_ENV: 'development' }).JWT_SECRET;

    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(second).toMatch(/^[0-9a-f]{64}$/);
    expect(first).not.toBe(second);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/JWT_SECRET is not set/));
  });

  test('production refuses to start without a strong secret', () => {
    expect(() => loadEnv({ NODE_ENV: 'production' })).toThrow(/JWT_SECRET must be defined/);
    expect(() => loadEnv({ NODE_ENV: 'production', JWT_SECRET: 'too-short' })).toThrow(/at least 32/);

    const strong = 'x'.repeat(40);
    expect(loadEnv({ NODE_ENV: 'production', JWT_SECRET: strong }).JWT_SECRET).toBe(strong);
  });

  test('production refuses the example values that ship in .env.example', () => {
    expect(() => loadEnv({ NODE_ENV: 'production', JWT_SECRET: EXAMPLE_JWT_SECRET })).toThrow(/example value/);

    const secret = 'x'.repeat(40);
    expect(() => loadEnv({ NODE_ENV: 'production', JWT_SECRET: secret, ADMIN_PASSWORD: EXAMPLE_ADMIN_PASSWORD }))
      .toThrow(/ADMIN_PASSWORD still has the example value/);
    expect(loadEnv({ NODE_ENV: 'production', JWT_SECRET: secret, ADMIN_PASSWORD: 'a-real-password' }).ADMIN_PASSWORD).toBe('a-real-password');

    // Development keeps working with the template as it is.
    expect(loadEnv({ NODE_ENV: 'development', JWT_SECRET: EXAMPLE_JWT_SECRET, ADMIN_PASSWORD: EXAMPLE_ADMIN_PASSWORD }).JWT_SECRET)
      .toBe(EXAMPLE_JWT_SECRET);
  });

  test('token lifetimes written as plain digits mean seconds, not milliseconds', () => {
    expect(loadEnv({ NODE_ENV: 'test', JWT_EXPIRES_IN: '3600' }).JWT_EXPIRES_IN).toBe(3600);
    expect(loadEnv({ NODE_ENV: 'test', JWT_EXPIRES_IN: ' 7200 ' }).JWT_EXPIRES_IN).toBe(7200);
    expect(loadEnv({ NODE_ENV: 'test', JWT_EXPIRES_IN: '12h' }).JWT_EXPIRES_IN).toBe('12h');
    expect(loadEnv({ NODE_ENV: 'test' }).JWT_EXPIRES_IN).toBe('30d');

    const jwt = require('jsonwebtoken');
    const { exp, iat } = jwt.decode(jwt.sign({}, 'secret', { expiresIn: loadEnv({ NODE_ENV: 'test', JWT_EXPIRES_IN: '3600' }).JWT_EXPIRES_IN }));
    expect(exp - iat).toBe(3600);
  });
});

describe('The template (.env.example)', () => {
  const template = parseEnvFile(path.join(ROOT, '.env.example'));

  test('documents every variable the application reads', () => {
    const documented = Object.keys(template);
    const missing = ENV_KEYS.filter((key) => !documented.includes(key));
    expect(missing).toEqual([]);
  });

  test('its placeholder values match the ones production refuses', () => {
    expect(template.JWT_SECRET).toBe(EXAMPLE_JWT_SECRET);
    expect(template.ADMIN_PASSWORD).toBe(EXAMPLE_ADMIN_PASSWORD);
  });

  test('contains no real credentials', () => {
    expect(template.GEODEX_API_KEY).toBe('');
    expect(template.OPENAI_API_KEY).toBe('');
  });

  test('ships the login limits that are also the defaults', () => {
    const defaults = loadEnv({ NODE_ENV: 'test' });
    expect(Number(template.LOGIN_MAX_ATTEMPTS)).toBe(defaults.LOGIN_MAX_ATTEMPTS);
    expect(Number(template.LOGIN_LOCK_MINUTES)).toBe(defaults.LOGIN_LOCK_MINUTES);
  });

  test('loads into a working configuration', () => {
    const env = loadEnv({ NODE_ENV: 'development', ...Object.fromEntries(Object.entries(template).filter(([, value]) => value !== '')) });
    expect(env.PORT).toBe(Number(template.PORT));
    expect(env.ADMIN_EMAIL).toBe(template.ADMIN_EMAIL.toLowerCase());
    expect(env.GEODEX_API_KEY).toBe('');
  });
});

describe('Other settings', () => {
  test('environment flags follow NODE_ENV', () => {
    expect(loadEnv({ NODE_ENV: 'test' })).toMatchObject({ isTest: true, isProduction: false });
    expect(loadEnv({ NODE_ENV: 'development', JWT_SECRET: 'x' })).toMatchObject({ isTest: false, isProduction: false });
    expect(loadEnv({ NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(40) })).toMatchObject({ isTest: false, isProduction: true });
  });

  test('SQL statements are logged only while developing, unless configured', () => {
    expect(loadEnv({ NODE_ENV: 'development', JWT_SECRET: 'x' }).LOG_SQL).toBe(true);
    expect(loadEnv({ NODE_ENV: 'test' }).LOG_SQL).toBe(false);
    expect(loadEnv({ NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(40) }).LOG_SQL).toBe(false);
    expect(loadEnv({ NODE_ENV: 'development', JWT_SECRET: 'x', LOG_SQL: 'false' }).LOG_SQL).toBe(false);
    expect(loadEnv({ NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(40), LOG_SQL: 'true' }).LOG_SQL).toBe(true);
  });

  test('password hashing is cheaper under test and standard otherwise, unless configured', () => {
    expect(loadEnv({ NODE_ENV: 'test' }).BCRYPT_ROUNDS).toBe(4);
    expect(loadEnv({ NODE_ENV: 'development', JWT_SECRET: 'x' }).BCRYPT_ROUNDS).toBe(10);
    expect(loadEnv({ NODE_ENV: 'development', JWT_SECRET: 'x', BCRYPT_ROUNDS: '12' }).BCRYPT_ROUNDS).toBe(12);
  });

  test('failed logins are limited to 3 per 15 minutes unless configured with whole numbers of at least 1', () => {
    expect(loadEnv({ NODE_ENV: 'test' })).toMatchObject({ LOGIN_MAX_ATTEMPTS: 3, LOGIN_LOCK_MINUTES: 15 });
    expect(loadEnv({ NODE_ENV: 'test', LOGIN_MAX_ATTEMPTS: '5', LOGIN_LOCK_MINUTES: '1' }))
      .toMatchObject({ LOGIN_MAX_ATTEMPTS: 5, LOGIN_LOCK_MINUTES: 1 });

    for (const invalid of ['0', '-2', '2.5', 'abc', '']) {
      expect([invalid, loadEnv({ NODE_ENV: 'test', LOGIN_MAX_ATTEMPTS: invalid, LOGIN_LOCK_MINUTES: invalid })])
        .toEqual([invalid, expect.objectContaining({ LOGIN_MAX_ATTEMPTS: 3, LOGIN_LOCK_MINUTES: 15 })]);
    }
  });

  test('trust proxy is off unless configured, and understands booleans, proxy counts and Express values', () => {
    expect(loadEnv({ NODE_ENV: 'test' }).TRUST_PROXY).toBe(false);
    expect(loadEnv({ NODE_ENV: 'test', TRUST_PROXY: 'false' }).TRUST_PROXY).toBe(false);
    expect(loadEnv({ NODE_ENV: 'test', TRUST_PROXY: 'true' }).TRUST_PROXY).toBe(true);
    expect(loadEnv({ NODE_ENV: 'test', TRUST_PROXY: ' 2 ' }).TRUST_PROXY).toBe(2);
    expect(loadEnv({ NODE_ENV: 'test', TRUST_PROXY: 'loopback, 10.0.0.0/8' }).TRUST_PROXY).toBe('loopback, 10.0.0.0/8');
  });

  test('the administrator email is normalized and there are no built-in credentials', () => {
    const configured = loadEnv({ NODE_ENV: 'test', ADMIN_EMAIL: '  Admin@Example.COM ' });
    expect(configured.ADMIN_EMAIL).toBe('admin@example.com');

    const empty = loadEnv({ NODE_ENV: 'test' });
    expect(empty.ADMIN_EMAIL).toBe('');
    expect(empty.ADMIN_PASSWORD).toBe('');
  });

  test('external providers are disabled unless configured', () => {
    const env = loadEnv({ NODE_ENV: 'development', JWT_SECRET: 'x' });
    expect(env.GEODEX_API_KEY).toBe('');
    expect(env.ML_SERVER_URL).toBe('');
    expect(env.OPENAI_API_KEY).toBe('');
    expect(env.GEODEX_API_URL).toMatch(/^https:\/\/.+run\.app$/);
    // A real query takes about 10 seconds: the service counts it even when the caller gave up.
    expect(env.GEODEX_TIMEOUT_MS).toBe(30000);
  });

  test('the GeoDex base URL is stored without trailing slashes', () => {
    const env = loadEnv({ NODE_ENV: 'test', GEODEX_API_URL: 'https://geodex.example.com//' });
    expect(env.GEODEX_API_URL).toBe('https://geodex.example.com');
  });
});
