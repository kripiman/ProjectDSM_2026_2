const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const UserEvent = sequelize.define('user_event', {
  id: {
    type: DataTypes.STRING,
    primaryKey: true
  },
  user_id: {
    type: DataTypes.STRING,
    allowNull: true,
    references: {
      model: 'user',
      key: 'id'
    },
    onDelete: 'SET NULL'
  },
  event_type: {
    type: DataTypes.STRING,
    allowNull: false // e.g. 'app_open', 'scan_uploaded', 'scan_success', 'specimen_viewed', 'collection_saved'
  },
  payload: {
    type: DataTypes.JSON,
    allowNull: true
  },
  ip_address: {
    type: DataTypes.STRING,
    allowNull: true
  },
  user_agent: {
    type: DataTypes.STRING,
    allowNull: true
  }
}, {
  tableName: 'user_event',
  timestamps: true,
  underscored: true
});

module.exports = UserEvent;
