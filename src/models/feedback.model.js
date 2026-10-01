const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/database');
const { FEEDBACK_RATINGS } = require('../config/constants');

class Feedback extends Model {}

Feedback.init({
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
  user_id: {
    type: DataTypes.STRING,
    allowNull: true,
    references: {
      model: 'user',
      key: 'id'
    },
    onDelete: 'SET NULL'
  },
  rating: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      isIn: [Object.values(FEEDBACK_RATINGS)]
    }
  },
  suggested_specimen_id: {
    type: DataTypes.STRING,
    allowNull: true,
    references: {
      model: 'specimen',
      key: 'id'
    },
    onDelete: 'SET NULL'
  },
  comments: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  sequelize,
  modelName: 'Feedback',
  tableName: 'feedback',
  timestamps: true,
  underscored: true,
  indexes: [
    // A recognition can carry at most one evaluation.
    {
      unique: true,
      fields: ['analysis_id']
    },
    { fields: ['user_id'] }
  ]
});

module.exports = Feedback;
