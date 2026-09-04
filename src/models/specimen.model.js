const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const { SPECIMEN_CATEGORIES, SPECIMEN_RARITIES } = require('../config/constants');

const Specimen = sequelize.define('specimen', {
  id: {
    type: DataTypes.STRING,
    primaryKey: true // Slug or UUID (e.g. 'quartz', 'pyrite', 'basalt')
  },
  name_es: {
    type: DataTypes.STRING,
    allowNull: false
  },
  name_en: {
    type: DataTypes.STRING,
    allowNull: false
  },
  scientific_name: {
    type: DataTypes.STRING,
    allowNull: true
  },
  category: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      isIn: [Object.values(SPECIMEN_CATEGORIES)]
    }
  },
  rarity: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: SPECIMEN_RARITIES.COMMON,
    validate: {
      isIn: [Object.values(SPECIMEN_RARITIES)]
    }
  },
  mohs_hardness_min: {
    type: DataTypes.FLOAT,
    allowNull: true
  },
  mohs_hardness_max: {
    type: DataTypes.FLOAT,
    allowNull: true
  },
  streak_color: {
    type: DataTypes.STRING,
    allowNull: true
  },
  luster: {
    type: DataTypes.STRING,
    allowNull: true
  },
  color_description: {
    type: DataTypes.STRING,
    allowNull: true
  },
  crystal_system: {
    type: DataTypes.STRING,
    allowNull: true
  },
  cleavage: {
    type: DataTypes.STRING,
    allowNull: true
  },
  fracture: {
    type: DataTypes.STRING,
    allowNull: true
  },
  magnetism: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  specific_gravity: {
    type: DataTypes.FLOAT,
    allowNull: true
  },
  chemical_formula: {
    type: DataTypes.STRING,
    allowNull: true
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  identification_tips: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  thumbnail_url: {
    type: DataTypes.STRING,
    allowNull: true
  },
  full_image_url: {
    type: DataTypes.STRING,
    allowNull: true
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  }
}, {
  tableName: 'specimen',
  timestamps: true,
  underscored: true
});

module.exports = Specimen;
