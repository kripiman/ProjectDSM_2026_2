const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/database');
const { ANALYSIS_STATUS, PROVIDERS } = require('../config/constants');

class Analysis extends Model {}

Analysis.init({
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
  image_url: {
    type: DataTypes.STRING,
    allowNull: false
  },
  status: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: ANALYSIS_STATUS.COMPLETED
  },
  is_specimen: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },
  error_code: {
    type: DataTypes.STRING,
    allowNull: true
  },
  extracted_features: {
    type: DataTypes.JSON, // Stored as JSON in SQLite
    allowNull: true
  },
  provider_used: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: PROVIDERS.HEURISTIC
  },
  ai_confidence: {
    type: DataTypes.FLOAT,
    allowNull: true
  },
  primary_specimen_id: {
    type: DataTypes.STRING,
    allowNull: true,
    references: {
      model: 'specimen',
      key: 'id'
    },
    onDelete: 'SET NULL'
  },
  educational_explanation: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  refinement_status: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'none' // 'none', 'pending', 'refined'
  },
  raw_ai_response: {
    type: DataTypes.JSON,
    allowNull: true
  },
  execution_time_ms: {
    type: DataTypes.INTEGER,
    allowNull: true
  }
}, {
  sequelize,
  modelName: 'Analysis',
  tableName: 'analysis',
  timestamps: true,
  underscored: true
});

module.exports = Analysis;
