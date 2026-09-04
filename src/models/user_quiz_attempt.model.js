const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const UserQuizAttempt = sequelize.define('user_quiz_attempt', {
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
  quiz_id: {
    type: DataTypes.STRING,
    allowNull: false,
    references: {
      model: 'quiz',
      key: 'id'
    },
    onDelete: 'CASCADE'
  },
  score: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  total_questions: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  xp_earned: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  passed: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  completed_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'user_quiz_attempt',
  timestamps: true,
  underscored: true
});

module.exports = UserQuizAttempt;
