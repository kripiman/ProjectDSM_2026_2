const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Achievement = sequelize.define('achievement', {
  id: {
    type: DataTypes.STRING,
    primaryKey: true
  },
  code: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  category: {
    type: DataTypes.STRING,
    allowNull: false // 'discovery', 'streak', 'refinement', 'quiz'
  },
  icon_url: {
    type: DataTypes.STRING,
    allowNull: true
  },
  required_count: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1
  },
  xp_reward: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 50
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  }
}, {
  tableName: 'achievement',
  timestamps: true,
  underscored: true
});

module.exports = Achievement;
