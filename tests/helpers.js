const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const request = require('supertest');
const env = require('../src/config/env');
const Server = require('../src/utils/server');
const { User, UserPreference } = require('../src/models');
const { generateTokenForUser } = require('../src/services/token.service');
const { uuidv4 } = require('../src/utils/uuid');

const FIXTURES_DIR = path.resolve(__dirname, 'fixtures');
const NOT_A_ROCK = path.join(FIXTURES_DIR, 'not_a_rock.jpg');

const TEST_PASSWORD = 'Password123!';

// The pipeline derives its (simulated) visual features from the size of the image,
// so images of different sizes end up recognised as different specimens. These
// variants give tests a deterministic way to discover specific rocks.
const RECOGNITION_VARIANTS = {
  quartz: 500,
  pyrite: 501,
  basalt: 502,
  sandstone: 503
};

// Test images live under the temporary root that tests/setup.js creates and removes.
const imageDir = path.join(process.env.TEST_TMP_ROOT, 'images');
fs.mkdirSync(imageDir, { recursive: true });

/** Builds an application instance (its own database is prepared by tests/setup.js). */
const createApp = () => new Server().app;

/** Files currently stored in the folder for recognition uploads. */
const storedAnalysisImages = () => fs.readdirSync(env.UPLOAD_DIR);

/** Files currently stored in the folder for catalog pictures. */
const storedSpecimenImages = () => fs.readdirSync(env.SPECIMEN_UPLOAD_DIR);

const uniqueSuffix = () => `${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
const uniqueEmail = (prefix = 'user') => `${prefix}_${uniqueSuffix()}@example.com`;
const auth = (token) => ({ Authorization: `Bearer ${token}` });

/**
 * Writes a throw-away image of exactly `size` bytes and returns its path.
 * @param {number} size
 * @param {string} [extension]
 */
const makeImage = (size, extension = 'jpg') => {
  const file = path.join(imageDir, `rock_${size}_${uniqueSuffix()}.${extension}`);
  fs.writeFileSync(file, crypto.randomBytes(size));
  return file;
};

const createGuest = async (app) => {
  const res = await request(app).post('/auth/anonymous').expect(201);
  return { token: res.body.data.token, user: res.body.data.user };
};

const registerUser = async (app, overrides = {}) => {
  const email = overrides.email || uniqueEmail();
  const password = overrides.password || TEST_PASSWORD;
  const res = await request(app)
    .post('/auth/register')
    .send({ email, password, ...overrides })
    .expect(201);

  return { token: res.body.data.token, user: res.body.data.user, email, password };
};

/**
 * Administrators cannot be created through the API (by design), so tests write the
 * account straight to the database and sign a token for it.
 */
const createAdmin = async (overrides = {}) => {
  const email = overrides.email || uniqueEmail('admin');
  const user = await User.create({
    id: uuidv4(),
    email,
    password_hash: await bcrypt.hash(TEST_PASSWORD, env.BCRYPT_ROUNDS),
    display_name: 'Test Admin',
    is_anonymous: false,
    role: 'admin',
    ...overrides
  });
  await UserPreference.create({ user_id: user.id, language: 'es', theme: 'system' });

  return { token: generateTokenForUser(user), user, email, password: TEST_PASSWORD };
};

/**
 * Submits an image for recognition as `token`'s user.
 * @param {string|number} [image] Variant name (see RECOGNITION_VARIANTS), byte size or file path.
 */
const recognize = (app, token, image = 'quartz') => {
  let file = image;
  if (typeof image === 'string' && RECOGNITION_VARIANTS[image] !== undefined) {
    file = makeImage(RECOGNITION_VARIANTS[image]);
  } else if (typeof image === 'number') {
    file = makeImage(image);
  }
  return request(app).post('/analysis').set(auth(token)).attach('image', file);
};

module.exports = {
  NOT_A_ROCK,
  TEST_PASSWORD,
  RECOGNITION_VARIANTS,
  createApp,
  storedAnalysisImages,
  storedSpecimenImages,
  uniqueEmail,
  auth,
  makeImage,
  createGuest,
  registerUser,
  createAdmin,
  recognize
};
