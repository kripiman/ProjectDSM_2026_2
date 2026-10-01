const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/database');

class AnalysisCandidate extends Model {}

AnalysisCandidate.init({
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
  specimen_id: {
    type: DataTypes.STRING,
    allowNull: false,
    references: {
      model: 'specimen',
      key: 'id'
    },
    onDelete: 'CASCADE'
  },
  rank: {
    type: DataTypes.INTEGER,
    allowNull: false // 1, 2, 3
  },
  confidence_score: {
    type: DataTypes.FLOAT,
    allowNull: false
  },
  provider: {
    type: DataTypes.STRING,
    allowNull: false
  },
  rationale: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  is_selected: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  }
}, {
  sequelize,
  modelName: 'AnalysisCandidate',
  tableName: 'analysis_candidate',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['analysis_id'] }
  ]
});

module.exports = AnalysisCandidate;
