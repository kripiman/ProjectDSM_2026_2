const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const QuizQuestion = sequelize.define('quiz_question', {
  id: {
    type: DataTypes.STRING,
    primaryKey: true
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
  specimen_id: {
    type: DataTypes.STRING,
    allowNull: true,
    references: {
      model: 'specimen',
      key: 'id'
    },
    onDelete: 'SET NULL'
  },
  question_text: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  explanation: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  options: {
    type: DataTypes.JSON, // JSON array of options: ["A", "B", "C", "D"]
    allowNull: false
  },
  correct_option_index: {
    type: DataTypes.INTEGER,
    allowNull: false
  }
}, {
  tableName: 'quiz_question',
  timestamps: true,
  underscored: true
});

module.exports = QuizQuestion;
