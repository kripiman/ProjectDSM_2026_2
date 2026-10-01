const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/database');

class CollectionItem extends Model {}

CollectionItem.init({
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
  specimen_id: {
    type: DataTypes.STRING,
    allowNull: false,
    references: {
      model: 'specimen',
      key: 'id'
    },
    onDelete: 'CASCADE'
  },
  analysis_id: {
    type: DataTypes.STRING,
    allowNull: true,
    references: {
      model: 'analysis',
      key: 'id'
    },
    onDelete: 'SET NULL'
  },
  // Date of the first recognition; it is never rewritten afterwards.
  discovered_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  // Total times the user has recognised this specimen (1 = only the discovery).
  occurrences_count: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1
  },
  additional_recognitions: {
    type: DataTypes.VIRTUAL,
    get() {
      return Math.max(0, (this.getDataValue('occurrences_count') || 1) - 1);
    }
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  custom_image_url: {
    type: DataTypes.STRING,
    allowNull: true
  },
  is_favorite: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  }
}, {
  sequelize,
  modelName: 'CollectionItem',
  tableName: 'collection_item',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      unique: true,
      fields: ['user_id', 'specimen_id']
    }
  ]
});

module.exports = CollectionItem;
