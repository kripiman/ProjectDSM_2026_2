const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const AnalysisRefinement = sequelize.define('analysis_refinement', {
  id: {
    type: DataTypes.STRING,
    primaryKey: true
  },
  analysis_id: {
    type: DataTypes.STRING,
    allowNull: false,
    references: {
      model: 'analysis',
      key: 'id'
    },
    onDelete: 'CASCADE'
  },
  question_type: {
    type: DataTypes.STRING,
    allowNull: false // 'hardness', 'streak', 'luster', 'magnetism'
  },
  user_answer: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  confidence_delta: {
    type: DataTypes.FLOAT,
    defaultValue: 0.0
  }
}, {
  tableName: 'analysis_refinement',
  timestamps: true,
  underscored: true
});

module.exports = AnalysisRefinement;
