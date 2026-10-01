const { Op, fn, col } = require('sequelize');
const { Specimen, Category, Type, sequelize } = require('../models');
const CatalogService = require('../services/catalog.service');
const { successResponse } = require('../utils/response_formatter');
const { AppError } = require('../utils/app_error');
const { ERROR_CODES } = require('../config/constants');
const { buildPagination, toPageWindow } = require('../utils/pagination');

const parseId = (value, label) => {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) {
    throw new AppError(404, `${label} with ID '${value}' not found`, ERROR_CODES.NOT_FOUND);
  }
  return id;
};

/**
 * Builds the CRUD controller shared by the two taxonomy entities (categories and
 * types). They are independent tables with identical rules:
 *  - names are unique (case-insensitive; already normalized by the validation layer);
 *  - only administrators can change them (enforced in the router);
 *  - an entry that still has rocks associated cannot be deleted.
 *
 * @param {object} config
 * @param {import('sequelize').ModelStatic<any>} config.Model
 * @param {string} config.label Human readable singular name used in messages.
 * @param {'category_id'|'type_id'} config.foreignKey Column of `specimen` pointing to this entity.
 */
const buildTaxonomyController = ({ Model, label, foreignKey }) => {
  const notFound = (id) => new AppError(404, `${label} with ID '${id}' not found`, ERROR_CODES.NOT_FOUND);

  const rockCounts = async () => {
    const rows = await Specimen.findAll({
      attributes: [foreignKey, [fn('COUNT', col('id')), 'rock_count']],
      group: [foreignKey],
      raw: true
    });
    return new Map(rows.map((row) => [row[foreignKey], Number(row.rock_count)]));
  };

  const present = (item, rockCount) => ({
    id: item.id,
    name: item.name,
    description: item.description,
    rock_count: rockCount,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  });

  const list = async (req, res, next) => {
    try {
      const { q } = req.validatedQuery || {};
      const where = q ? { name: { [Op.like]: `%${q.toLowerCase()}%` } } : {};

      const [items, counts] = await Promise.all([
        Model.findAll({ where, order: [['name', 'ASC']] }),
        rockCounts()
      ]);

      return successResponse(
        res,
        items.map((item) => present(item, counts.get(item.id) || 0)),
        `${label} list retrieved successfully`
      );
    } catch (error) {
      next(error);
    }
  };

  const getById = async (req, res, next) => {
    try {
      const id = parseId(req.params.id, label);
      const item = await Model.findByPk(id);
      if (!item) {
        throw notFound(id);
      }

      const rockCount = await Specimen.count({ where: { [foreignKey]: id } });
      return successResponse(res, present(item, rockCount), `${label} retrieved successfully`);
    } catch (error) {
      next(error);
    }
  };

  const listRocks = async (req, res, next) => {
    try {
      const id = parseId(req.params.id, label);
      const item = await Model.findByPk(id);
      if (!item) {
        throw notFound(id);
      }

      const window = toPageWindow(req.validatedQuery);
      const [{ total, rows }, rockCount] = await Promise.all([
        CatalogService.list({ [foreignKey]: id }, window),
        Specimen.count({ where: { [foreignKey]: id } })
      ]);

      return successResponse(res, {
        [label.toLowerCase()]: present(item, rockCount),
        rocks: rows,
        pagination: buildPagination(window, total)
      }, `Rocks of ${label.toLowerCase()} '${item.name}' retrieved successfully`);
    } catch (error) {
      next(error);
    }
  };

  const create = async (req, res, next) => {
    try {
      const { name, description } = req.body;

      const { item, restored } = await sequelize.transaction(async (transaction) => {
        // Soft-deleted rows still hold their name in the unique index, so they must
        // be part of the duplicate check.
        const existing = await Model.findOne({ where: { name }, paranoid: false, transaction });

        if (existing && !existing.deleted_at) {
          throw new AppError(409, `${label} '${name}' already exists`, ERROR_CODES.CONFLICT);
        }

        if (existing) {
          await existing.restore({ transaction });
          await existing.update({ description: description ?? null }, { transaction });
          await existing.reload({ transaction });
          return { item: existing, restored: true };
        }

        const created = await Model.create({ name, description: description ?? null }, { transaction });
        return { item: created, restored: false };
      });

      return successResponse(
        res,
        present(item, 0),
        restored ? `${label} '${item.name}' restored` : `${label} created successfully`,
        201
      );
    } catch (error) {
      next(error);
    }
  };

  const update = async (req, res, next) => {
    try {
      const id = parseId(req.params.id, label);
      const { name, description } = req.body;

      const { item, rockCount } = await sequelize.transaction(async (transaction) => {
        const current = await Model.findByPk(id, { transaction });
        if (!current) {
          throw notFound(id);
        }

        if (name !== undefined && name !== current.name) {
          const clash = await Model.findOne({
            where: { name, id: { [Op.ne]: id } },
            paranoid: false,
            transaction
          });
          if (clash) {
            const reason = clash.deleted_at ? 'is reserved by a deleted record' : 'already exists';
            throw new AppError(409, `${label} '${name}' ${reason}`, ERROR_CODES.CONFLICT);
          }
        }

        // Renaming a category also refreshes the name kept on its rocks (model hook).
        await current.update({
          ...(name !== undefined && { name }),
          ...(description !== undefined && { description })
        }, { transaction });

        const count = await Specimen.count({ where: { [foreignKey]: id }, transaction });
        return { item: current, rockCount: count };
      });

      return successResponse(res, present(item, rockCount), `${label} updated successfully`);
    } catch (error) {
      next(error);
    }
  };

  const remove = async (req, res, next) => {
    try {
      const id = parseId(req.params.id, label);

      await sequelize.transaction(async (transaction) => {
        const item = await Model.findByPk(id, { transaction });
        if (!item) {
          throw notFound(id);
        }

        // Entries are soft-deleted, so the database foreign key never fires: the
        // rule has to be enforced here.
        const linkedRocks = await Specimen.count({ where: { [foreignKey]: id }, transaction });
        if (linkedRocks > 0) {
          throw new AppError(
            400,
            `Cannot delete ${label.toLowerCase()} '${item.name}': ${linkedRocks} rock(s) are still associated with it`,
            ERROR_CODES.VALIDATION_ERROR,
            { rock_count: linkedRocks }
          );
        }

        await item.destroy({ transaction });
      });

      return successResponse(res, null, `${label} deleted successfully`);
    } catch (error) {
      next(error);
    }
  };

  return { list, getById, listRocks, create, update, remove };
};

module.exports = {
  category: buildTaxonomyController({ Model: Category, label: 'Category', foreignKey: 'category_id' }),
  type: buildTaxonomyController({ Model: Type, label: 'Type', foreignKey: 'type_id' })
};
