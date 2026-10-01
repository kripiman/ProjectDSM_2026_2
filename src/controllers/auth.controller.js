const bcrypt = require('bcryptjs');
const { uuidv4 } = require('../utils/uuid');
const env = require('../config/env');
const { USER_ROLES, ERROR_CODES } = require('../config/constants');
const { AppError } = require('../utils/app_error');
const { successResponse } = require('../utils/response_formatter');
const { serializeUser } = require('../utils/serializers');
const { generateTokenForUser } = require('../services/token.service');
const SessionService = require('../services/session.service');
const UserService = require('../services/user.service');
const { User, UserPreference, sequelize } = require('../models');

const createAnonymousSession = async (req, res, next) => {
  try {
    const userId = uuidv4();
    const guestUser = await sequelize.transaction(async (transaction) => {
      const created = await User.create({
        id: userId,
        is_anonymous: true,
        role: USER_ROLES.GUEST,
        display_name: `Explorador_${userId.substring(0, 6)}`
      }, { transaction });

      await UserPreference.create({
        user_id: userId,
        language: 'es',
        theme: 'system'
      }, { transaction });

      return created;
    });

    return successResponse(res, {
      token: generateTokenForUser(guestUser),
      user: serializeUser(guestUser)
    }, 'Anonymous guest session created successfully', 201);
  } catch (error) {
    next(error);
  }
};

/**
 * Returns the guest account referenced by `guestToken` when it can still be turned
 * into a registered account, or null. A session that was already converted (or whose
 * token was revoked or blocked) can never be claimed a second time.
 */
const findClaimableGuest = async (guestToken, transaction) => {
  if (!guestToken) {
    return null;
  }

  try {
    const user = await SessionService.resolveUser(guestToken, { transaction });
    return user.is_anonymous ? user : null;
  } catch (error) {
    if (error instanceof AppError) {
      return null; // Expired, revoked or unusable token: register without migrating anything.
    }
    throw error;
  }
};

const register = async (req, res, next) => {
  try {
    const { email, password, display_name, userName, phone, guest_token } = req.body;
    const resolvedUserName = userName || null;

    // Hashing is CPU bound: do it before the transaction so the database write lock
    // is held only for the time the queries themselves take.
    const passwordHash = await bcrypt.hash(password, env.BCRYPT_ROUNDS);

    const { user: newUser, guestMigrated } = await sequelize.transaction(async (transaction) => {
      const existingUser = await User.findOne({ where: { email }, transaction });
      if (existingUser) {
        throw new AppError(400, 'Email is already registered', ERROR_CODES.VALIDATION_ERROR);
      }

      if (resolvedUserName) {
        const existingUserName = await User.findOne({ where: { userName: resolvedUserName }, transaction });
        if (existingUserName) {
          throw new AppError(400, 'Username is already taken', ERROR_CODES.VALIDATION_ERROR);
        }
      }

      const guest = await findClaimableGuest(guest_token, transaction);

      if (guest) {
        // Upgrade the guest row in place: its recognitions, discoveries and
        // achievements already belong to this id.
        guest.email = email;
        if (resolvedUserName) guest.userName = resolvedUserName;
        if (phone) guest.phone = phone;
        guest.password_hash = passwordHash;
        guest.display_name = display_name || resolvedUserName || guest.display_name;
        guest.is_anonymous = false;
        guest.role = USER_ROLES.USER;
        // Invalidate every token issued for the temporary session.
        guest.token_version += 1;
        await guest.save({ transaction });
        return { user: guest, guestMigrated: true };
      }

      const created = await User.create({
        id: uuidv4(),
        email,
        userName: resolvedUserName,
        phone: phone || null,
        password_hash: passwordHash,
        display_name: display_name || resolvedUserName || email.split('@')[0],
        is_anonymous: false,
        role: USER_ROLES.USER
      }, { transaction });

      await UserPreference.create({
        user_id: created.id,
        language: 'es',
        theme: 'system'
      }, { transaction });

      return { user: created, guestMigrated: false };
    });

    return successResponse(res, {
      token: generateTokenForUser(newUser),
      guest_migrated: guestMigrated,
      user: serializeUser(newUser)
    }, 'User registered successfully', 201);
  } catch (error) {
    next(error);
  }
};

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await User.scope('withPassword').findOne({ where: { email } });
    if (!user || !user.password_hash) {
      throw new AppError(401, 'Invalid email or password', ERROR_CODES.UNAUTHORIZED);
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      throw new AppError(401, 'Invalid email or password', ERROR_CODES.UNAUTHORIZED);
    }

    UserService.assertActive(user);

    return successResponse(res, {
      token: generateTokenForUser(user),
      user: serializeUser(user)
    }, 'Login successful');
  } catch (error) {
    next(error);
  }
};

const deleteAccount = async (req, res, next) => {
  try {
    // HU-17: the account is closed and its personal data erased.
    await UserService.deleteAccount(req.user.id);

    return successResponse(res, null, 'Account and personal data deleted successfully');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createAnonymousSession,
  register,
  login,
  deleteAccount
};
