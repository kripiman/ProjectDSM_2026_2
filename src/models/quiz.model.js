const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/database');

class Quiz extends Model {}

Quiz.init({
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
  sequelize,
  modelName: 'Quiz',
  tableName: 'quiz',
  timestamps: true,
  underscored: true
});

module.exports = Quiz;
