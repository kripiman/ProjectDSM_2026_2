const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const UserAchievement = sequelize.define('user_achievement', {
  id: {
    type: DataTypes.STRING,
    primaryKey: true
  },
  user_id: {
    type: DataTypes.STRING,
    allowNull: false,
    references: {
      model: 'user',
      key: 'id'
    },
    onDelete: 'CASCADE'
  },
  achievement_id: {
    type: DataTypes.STRING,
    allowNull: false,
    references: {
      model: 'achievement',
      key: 'id'
    },
    onDelete: 'CASCADE'
  },
  current_progress: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  is_unlocked: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  unlocked_at: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'user_achievement',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      unique: true,
      fields: ['user_id', 'achievement_id']
    }
  ]
});

module.exports = UserAchievement;
