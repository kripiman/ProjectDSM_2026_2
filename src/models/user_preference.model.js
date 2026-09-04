const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const UserPreference = sequelize.define('user_preference', {
  user_id: {
    type: DataTypes.STRING,
    primaryKey: true,
    references: {
      model: 'user',
      key: 'id'
    },
    onDelete: 'CASCADE'
  },
  language: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'es'
  },
  theme: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'system' // 'light', 'dark', 'system'
  },
  reduce_animations: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  push_notifications: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  }
}, {
  tableName: 'user_preference',
  timestamps: true,
  underscored: true
});

module.exports = UserPreference;
