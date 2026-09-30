const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/database');

class UserEvent extends Model {}

UserEvent.init({
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
    allowNull: false 
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
  sequelize,
  modelName: 'UserEvent',
  tableName: 'user_event',
  timestamps: true,
  underscored: true
});

module.exports = UserEvent;
