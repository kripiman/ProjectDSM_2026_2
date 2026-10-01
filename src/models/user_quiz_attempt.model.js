const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/database');

class UserQuizAttempt extends Model {}

UserQuizAttempt.init({
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
  sequelize,
  modelName: 'UserQuizAttempt',
  tableName: 'user_quiz_attempt',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['user_id'] }
  ]
});

module.exports = UserQuizAttempt;
