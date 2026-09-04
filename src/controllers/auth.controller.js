const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { uuidv4 } = require('../utils/uuid');
const env = require('../config/env');
const { USER_ROLES, ERROR_CODES } = require('../config/constants');
const { AppError } = require('../middlewares/error.middleware');
const { successResponse } = require('../utils/response_formatter');
const { User, UserPreference, CollectionItem, Analysis, UserAchievement, sequelize } = require('../models');

const generateToken = (userId, role, isAnonymous) => {
  return jwt.sign(
    { userId, role, isAnonymous },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN }
  );
};

const createAnonymousSession = async (req, res, next) => {
  try {
    const userId = uuidv4();
    const guestUser = await User.create({
      id: userId,
      is_anonymous: true,
      role: USER_ROLES.GUEST,
      display_name: `Explorador_${userId.substring(0, 6)}`
    });

    await UserPreference.create({
      user_id: userId,
      language: 'es',
      theme: 'system'
    });

    const token = generateToken(guestUser.id, guestUser.role, true);

    return successResponse(res, {
      token,
      user: {
        id: guestUser.id,
        is_anonymous: true,
        display_name: guestUser.display_name,
        role: guestUser.role,
        current_level: guestUser.current_level,
        experience_points: guestUser.experience_points
      }
    }, 'Anonymous guest session created successfully', 201);
  } catch (error) {
    next(error);
  }
};

const register = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const { email, password, display_name, guest_token } = req.body;

    if (!email || !password) {
      throw new AppError(400, 'Email and password are required', ERROR_CODES.VALIDATION_ERROR);
    }

    const existingUser = await User.findOne({ where: { email }, transaction: t });
    if (existingUser) {
      throw new AppError(400, 'Email is already registered', ERROR_CODES.VALIDATION_ERROR);
    }

    const passwordHash = await bcrypt.hash(password, 10);
    let guestUserId = null;

    // Check if guest token was provided for migration (HU-11)
    if (guest_token) {
      try {
        const decoded = jwt.verify(guest_token, env.JWT_SECRET);
        guestUserId = decoded.userId;
      } catch (err) {
        // Token expired or invalid, proceed without guest migration
      }
    }

    let newUser;

    if (guestUserId) {
      const guestRecord = await User.findByPk(guestUserId, { transaction: t });
      if (guestRecord && guestRecord.is_anonymous) {
        // Upgrade guest user to registered account
        guestRecord.email = email;
        guestRecord.password_hash = passwordHash;
        guestRecord.display_name = display_name || guestRecord.display_name;
        guestRecord.is_anonymous = false;
        guestRecord.role = USER_ROLES.USER;
        await guestRecord.save({ transaction: t });
        newUser = guestRecord;
      }
    }

    if (!newUser) {
      const userId = uuidv4();
      newUser = await User.create({
        id: userId,
        email,
        password_hash: passwordHash,
        display_name: display_name || email.split('@')[0],
        is_anonymous: false,
        role: USER_ROLES.USER
      }, { transaction: t });

      await UserPreference.create({
        user_id: newUser.id,
        language: 'es',
        theme: 'system'
      }, { transaction: t });
    }

    await t.commit();

    const token = generateToken(newUser.id, newUser.role, false);

    return successResponse(res, {
      token,
      user: {
        id: newUser.id,
        email: newUser.email,
        display_name: newUser.display_name,
        is_anonymous: false,
        role: newUser.role,
        current_level: newUser.current_level,
        experience_points: newUser.experience_points
      }
    }, 'User registered successfully', 201);
  } catch (error) {
    await t.rollback();
    next(error);
  }
};

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      throw new AppError(400, 'Email and password are required', ERROR_CODES.VALIDATION_ERROR);
    }

    const user = await User.findOne({ where: { email } });
    if (!user || !user.password_hash) {
      throw new AppError(401, 'Invalid email or password', ERROR_CODES.UNAUTHORIZED);
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      throw new AppError(401, 'Invalid email or password', ERROR_CODES.UNAUTHORIZED);
    }

    const token = generateToken(user.id, user.role, user.is_anonymous);

    return successResponse(res, {
      token,
      user: {
        id: user.id,
        email: user.email,
        display_name: user.display_name,
        is_anonymous: user.is_anonymous,
        role: user.role,
        current_level: user.current_level,
        experience_points: user.experience_points
      }
    }, 'Login successful');
  } catch (error) {
    next(error);
  }
};

const deleteAccount = async (req, res, next) => {
  try {
    const user = req.user;
    // Soft-delete user (HU-17)
    await user.destroy();

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
