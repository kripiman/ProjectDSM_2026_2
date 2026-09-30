const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/database');

class Role extends Model {}

Role.init({
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
    type: DataTypes.STRING,
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
  modelName: 'Role',
  tableName: 'role',
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

module.exports = Role;
