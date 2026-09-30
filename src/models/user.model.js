const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/database');
const { USER_ROLES } = require('../config/constants');

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
    defaultValue: USER_ROLES.USER
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
  hooks: {
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
  delete values.password;
  delete values.password_hash;
  return values;
};

module.exports = User;
