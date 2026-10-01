const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/database');

class Category extends Model {}

Category.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
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
  modelName: 'Category',
  tableName: 'category',
  paranoid: true,
  timestamps: true,
  underscored: true,
  hooks: {
    // `specimen.category` is a readable copy of the category name: when the name
    // changes, refresh the copies (soft-deleted rocks included).
    afterUpdate: async (category, options) => {
      if (Array.isArray(options.fields) && options.fields.includes('name')) {
        await sequelize.models.Specimen.update(
          { category: category.name },
          { where: { category_id: category.id }, paranoid: false, transaction: options.transaction }
        );
      }
    },
    beforeDestroy: (instance) => {
      instance.is_deleted = true;
    },
    beforeRestore: (instance) => {
      instance.is_deleted = false;
    }
  }
});

module.exports = Category;
