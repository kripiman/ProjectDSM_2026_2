const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/database');
const { ANALYSIS_STATUS, REFINEMENT_STATUS, PROVIDERS } = require('../config/constants');

class Analysis extends Model {
  /** The stored file name is internal: responses carry `image_url` only. */
  toJSON() {
    const values = super.toJSON();
    delete values.image_file;
    return values;
  }
}

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
  // Name of the photo in the uploads folder (rows saved by earlier versions hold the
  // path "/uploads/analyses/<name>"; only the name is ever used). The column keeps its
  // original name.
  image_file: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'image_url'
  },
  // Photos are private: the address clients get is the endpoint that serves them to
  // their owner and to administrators, never a file URL.
  image_url: {
    type: DataTypes.VIRTUAL(DataTypes.STRING, ['id']),
    get() {
      return `/analysis/${this.getDataValue('id')}/image`;
    }
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
    defaultValue: REFINEMENT_STATUS.NONE
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
  underscored: true,
  indexes: [
    { fields: ['user_id'] },
    { fields: ['primary_specimen_id'] }
  ]
});

module.exports = Analysis;
