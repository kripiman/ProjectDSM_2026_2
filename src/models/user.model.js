const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const { USER_ROLES } = require('../config/constants');

const User = sequelize.define('user', {
  id: {
    type: DataTypes.STRING,
    primaryKey: true
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
  deleted_at: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'user',
  paranoid: true, // Enables soft deletion using deleted_at (HU-17)
  timestamps: true,
  underscored: true
});

module.exports = User;
