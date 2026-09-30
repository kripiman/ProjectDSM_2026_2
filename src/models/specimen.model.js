const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/database');
const { SPECIMEN_CATEGORIES, SPECIMEN_RARITIES } = require('../config/constants');

class Specimen extends Model {}

Specimen.init({
  id: {
    type: DataTypes.STRING,
    primaryKey: true // Slug or UUID (e.g. 'quartz', 'pyrite', 'basalt')
  },
  catalog_index: {
    type: DataTypes.INTEGER,
    allowNull: true,
    unique: true
  },
  category_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'category',
      key: 'id'
    }
  },
  type_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'type',
      key: 'id'
    }
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
  texture: {
    type: DataTypes.STRING,
    allowNull: true
  },
  transparency: {
    type: DataTypes.FLOAT,
    allowNull: true
  },
  tenacity: {
    type: DataTypes.FLOAT,
    allowNull: true
  },
  density: {
    type: DataTypes.FLOAT,
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
  molar_weight: {
    type: DataTypes.FLOAT,
    allowNull: true
  },
  composition: {
    type: DataTypes.STRING,
    allowNull: true
  },
  chemical_formula: {
    type: DataTypes.STRING,
    allowNull: true
  },
  environment: {
    type: DataTypes.STRING,
    allowNull: true
  },
  common_uses: {
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
  mindat_url: {
    type: DataTypes.STRING,
    allowNull: true
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },
  is_deleted: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  deleted_at: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  sequelize,
  modelName: 'Specimen',
  tableName: 'specimen',
  paranoid: true,
  timestamps: true,
  underscored: true,
  hooks: {
    beforeDestroy: (instance) => {
      instance.is_deleted = true;
    },
    beforeRestore: (instance) => {
      instance.is_deleted = false;
    }
  }
});

module.exports = Specimen;
