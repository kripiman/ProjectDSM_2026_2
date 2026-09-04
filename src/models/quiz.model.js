const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Quiz = sequelize.define('quiz', {
  id: {
    type: DataTypes.STRING,
    primaryKey: true
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  category: {
    type: DataTypes.STRING,
    allowNull: false // 'minerals', 'rocks', 'general'
  },
  difficulty: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'medium' // 'easy', 'medium', 'hard'
  },
  xp_reward: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 100
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  }
}, {
  tableName: 'quiz',
  timestamps: true,
  underscored: true
});

module.exports = Quiz;
