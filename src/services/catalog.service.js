const { Op } = require('sequelize');
const { Specimen, Category, Type } = require('../models');
const { AppError } = require('../utils/app_error');
const { normalizeName } = require('../utils/text');
const { ERROR_CODES } = require('../config/constants');

// A taxonomy name that cannot match any row, used when a filter names something unknown.
const NO_MATCH_ID = -1;

class CatalogService {
  /**
   * Associations returned together with every rock. Sequelize mutates include
   * objects, so each query needs its own copy.
   */
  static relations() {
    return [
      { model: Category, as: 'category_rel', attributes: ['id', 'name', 'description'], required: false },
      { model: Type, as: 'type_rel', attributes: ['id', 'name', 'description'], required: false }
    ];
  }

  static async idByName(Model, name) {
    if (name === undefined) {
      return undefined;
    }
    const row = await Model.findOne({ where: { name: normalizeName(name) }, attributes: ['id'] });
    return row ? row.id : NO_MATCH_ID;
  }

  /**
   * Translates the public filters (ids or taxonomy names, rarity, magnetism and a
   * free-text search) into a `where` clause. Categories and types are matched through
   * their ids, which are the source of truth.
   */
  static async buildWhere(filters = {}, { includeInactive = false } = {}) {
    const where = {};

    if (!includeInactive) {
      where.is_active = true;
    }

    const categoryId = filters.category_id ?? await CatalogService.idByName(Category, filters.category);
    if (categoryId !== undefined) {
      where.category_id = categoryId;
    }

    const typeId = filters.type_id ?? await CatalogService.idByName(Type, filters.type);
    if (typeId !== undefined) {
      where.type_id = typeId;
    }

    if (filters.rarity) {
      where.rarity = filters.rarity;
    }

    if (filters.magnetism !== undefined) {
      where.magnetism = filters.magnetism;
    }

    if (filters.q) {
      const pattern = `%${filters.q}%`;
      where[Op.or] = [
        { name_es: { [Op.like]: pattern } },
        { name_en: { [Op.like]: pattern } },
        { scientific_name: { [Op.like]: pattern } },
        { chemical_formula: { [Op.like]: pattern } }
      ];
    }

    return where;
  }

  /**
   * Lists catalog entries. Pagination is applied only when `limit` is given.
   * @returns {Promise<{ total: number, rows: import('sequelize').Model[] }>}
   */
  static async list(filters = {}, { includeInactive = false, page = 1, limit } = {}) {
    const query = {
      where: await CatalogService.buildWhere(filters, { includeInactive }),
      include: CatalogService.relations(),
      order: [['name_es', 'ASC']],
      distinct: true
    };

    if (limit) {
      query.limit = limit;
      query.offset = (page - 1) * limit;
    }

    const { count, rows } = await Specimen.findAndCountAll(query);
    return { total: count, rows };
  }

  /**
   * Ensures the referenced category and type exist (and have not been deleted).
   * A foreign key alone would accept a soft-deleted row.
   */
  static async assertTaxonomyExists({ category_id: categoryId, type_id: typeId } = {}, transaction) {
    if (categoryId !== undefined && categoryId !== null) {
      const category = await Category.findByPk(categoryId, { transaction });
      if (!category) {
        throw new AppError(400, `La categoría con ID '${categoryId}' no existe`, ERROR_CODES.VALIDATION_ERROR);
      }
    }

    if (typeId !== undefined && typeId !== null) {
      const type = await Type.findByPk(typeId, { transaction });
      if (!type) {
        throw new AppError(400, `El tipo con ID '${typeId}' no existe`, ERROR_CODES.VALIDATION_ERROR);
      }
    }
  }
}

module.exports = CatalogService;
