const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/database');
const { USER_ROLES, USER_STATUS, ROLE_IDS } = require('../config/constants');
const { persistHookChanges } = require('../utils/model_hooks');

const ROLE_NAMES_BY_ID = Object.fromEntries(
  Object.entries(ROLE_IDS).map(([name, id]) => [id, name])
);

class User extends Model {}

User.init({
  id: {
    type: DataTypes.STRING,
    primaryKey: true
  },
  role_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'role',
      key: 'id'
    }
  },
  userName: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true,
    field: 'user_name'
  },
  email: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true
  },
  password_hash: {
    type: DataTypes.STRING,
    allowNull: true
  },
  phone: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true
  },
  display_name: {
    type: DataTypes.STRING,
    allowNull: true
  },
  avatar_url: {
    type: DataTypes.STRING,
    allowNull: true
  },
  is_anonymous: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },
  role: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: USER_ROLES.USER,
    validate: {
      isIn: [Object.values(USER_ROLES)]
    }
  },
  status: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: USER_STATUS.ACTIVE,
    validate: {
      isIn: [Object.values(USER_STATUS)]
    }
  },
  // Incremented whenever previously issued tokens must stop working (e.g. once a
  // guest session has been converted into a registered account).
  token_version: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1
  },
  experience_points: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  current_level: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1
  },
  is_deleted: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  deleted_at: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  sequelize,
  modelName: 'User',
  tableName: 'user',
  paranoid: true,
  timestamps: true,
  underscored: true,
  // The hash never leaves the database unless a query explicitly asks for it
  // (`User.scope('withPassword')`, used only by the login flow). This also covers
  // users nested in `include` clauses, which bypass the `toJSON` override below.
  defaultScope: {
    attributes: { exclude: ['password_hash'] }
  },
  scopes: {
    withPassword: {}
  },
  hooks: {
    // `role` (name) and `role_id` (foreign key) describe the same fact; keep them in
    // agreement whichever of the two is written. Runs for instance saves/updates.
    beforeSave: (user, options) => {
      if (user.changed('role_id') && !user.changed('role') && ROLE_NAMES_BY_ID[user.role_id]) {
        user.role = ROLE_NAMES_BY_ID[user.role_id];
      } else if (ROLE_IDS[user.role]) {
        user.role_id = ROLE_IDS[user.role];
      }
      persistHookChanges(user, options, ['role', 'role_id']);
    },
    beforeDestroy: (instance) => {
      instance.is_deleted = true;
    },
    beforeRestore: (instance) => {
      instance.is_deleted = false;
    }
  }
});

User.prototype.toJSON = function () {
  const values = { ...this.get() };
  delete values.password_hash;
  return values;
};

module.exports = User;
