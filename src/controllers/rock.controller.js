const { Op } = require('sequelize');
const { Specimen, sequelize } = require('../models');
const CatalogService = require('../services/catalog.service');
const env = require('../config/env');
const { uuidv4 } = require('../utils/uuid');
const { slugify } = require('../utils/text');
const { removeStoredImage } = require('../utils/uploads');
const { AppError } = require('../utils/app_error');
const { ERROR_CODES, USER_ROLES, UPLOAD_URL_PREFIXES } = require('../config/constants');
const { buildPagination } = require('../utils/pagination');

const isAdmin = (req) => Boolean(req.user) && req.user.role === USER_ROLES.ADMIN;

const buildRockId = (name) => `${slugify(name) || 'rock'}_${uuidv4().substring(0, 6)}`;

const assertHardnessRange = (min, max) => {
  if (min !== null && min !== undefined && max !== null && max !== undefined && min > max) {
    throw new AppError(400, 'La dureza mínima no puede ser mayor que la dureza máxima', ERROR_CODES.VALIDATION_ERROR);
  }
};

/**
 * These endpoints keep the envelope of the original classroom API: the payload is
 * sent under `data` and, repeated, at the top level (`rock`, `rocks`).
 */
const sendRockResponse = (res, statusCode, message, payload) => res.status(statusCode).json({
  success: true,
  statusCode,
  ...(message && { message }),
  data: payload,
  ...payload
});

/**
 * Creates a new rock/specimen record with normalized attributes.
 */
const create = async (req, res, next) => {
  try {
    const data = req.body;

    const rock = await sequelize.transaction(async (transaction) => {
      await CatalogService.assertTaxonomyExists(data, transaction);

      const existingRock = await Specimen.findOne({
        where: { scientific_name: data.scientific_name },
        transaction
      });
      if (existingRock) {
        throw new AppError(400, 'No puede añadir una roca que ya esté en el sistema.', ERROR_CODES.VALIDATION_ERROR);
      }

      return Specimen.create({
        ...data,
        id: data.id || buildRockId(data.name_es),
        name_en: data.name_en || data.name_es,
        thumbnail_url: data.thumbnail_url ?? data.full_image_url,
        is_active: true,
        is_deleted: false
      }, { transaction });
    });

    const created = await Specimen.findByPk(rock.id, { include: CatalogService.relations() });

    return sendRockResponse(res, 201, 'Se ha añadido satisfactoriamente la roca.', { rock: created });
  } catch (error) {
    next(error);
  }
};

/**
 * Retrieves the catalog with its category and type relations. Filterable by
 * `category_id`/`category`, `type_id`/`type`, rarity, magnetism and a text search;
 * paginated only when `limit` is requested. Deactivated rocks are visible to
 * administrators who ask for them with `include_inactive=true`.
 */
const obtain = async (req, res, next) => {
  try {
    const { include_inactive: includeInactive, page = 1, limit, ...filters } = req.validatedQuery;

    const { total, rows } = await CatalogService.list(filters, {
      includeInactive: Boolean(includeInactive) && isAdmin(req),
      page,
      limit
    });

    return sendRockResponse(res, 200, 'Rocas obtenidas satisfactoriamente.', {
      rocks: rows,
      ...(limit && { pagination: buildPagination({ page, limit }, total) })
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Retrieves a single rock by ID or catalog index.
 */
const obtainById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const catalogIndex = Number(id);
    const where = {
      [Op.or]: [
        { id },
        { catalog_index: Number.isFinite(catalogIndex) ? catalogIndex : -1 }
      ]
    };
    if (!isAdmin(req)) {
      where.is_active = true;
    }

    const rock = await Specimen.findOne({
      where,
      include: CatalogService.relations()
    });

    if (!rock) {
      throw new AppError(404, 'Roca no encontrada', ERROR_CODES.NOT_FOUND);
    }

    return sendRockResponse(res, 200, null, { rock });
  } catch (error) {
    next(error);
  }
};

/**
 * Updates rock properties safely using validated attributes.
 */
const update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const changes = req.body;
    let previousImage;

    const rock = await sequelize.transaction(async (transaction) => {
      const current = await Specimen.findOne({ where: { id }, transaction });
      if (!current) {
        throw new AppError(404, 'Roca no encontrada', ERROR_CODES.NOT_FOUND);
      }

      await CatalogService.assertTaxonomyExists(changes, transaction);
      assertHardnessRange(
        changes.mohs_hardness_min ?? current.mohs_hardness_min,
        changes.mohs_hardness_max ?? current.mohs_hardness_max
      );

      if (changes.scientific_name && changes.scientific_name !== current.scientific_name) {
        const duplicate = await Specimen.findOne({
          where: { scientific_name: changes.scientific_name, id: { [Op.ne]: id } },
          transaction
        });
        if (duplicate) {
          throw new AppError(400, 'No puede añadir una roca que ya esté en el sistema.', ERROR_CODES.VALIDATION_ERROR);
        }
      }

      previousImage = current.full_image_url;
      await current.update(changes, { transaction });
      return current;
    });

    // A picture that this update replaced no longer has a use: do not leave it on disk.
    if (changes.full_image_url && changes.full_image_url !== previousImage) {
      await removeStoredImage(previousImage, {
        urlPrefix: UPLOAD_URL_PREFIXES.SPECIMENS,
        directory: env.SPECIMEN_UPLOAD_DIR
      });
    }

    const updated = await Specimen.findByPk(rock.id, { include: CatalogService.relations() });

    return sendRockResponse(res, 200, 'Roca actualizada correctamente', { rock: updated });
  } catch (error) {
    next(error);
  }
};

/**
 * Dual soft delete: the `is_deleted` flag and Sequelize's paranoid `deleted_at` are
 * both set by `destroy()`.
 */
const deleteRock = async (req, res, next) => {
  try {
    const { id } = req.params;

    await sequelize.transaction(async (transaction) => {
      const rock = await Specimen.findOne({ where: { id }, transaction });
      if (!rock) {
        throw new AppError(404, 'Roca no encontrada', ERROR_CODES.NOT_FOUND);
      }
      await rock.destroy({ transaction });
    });

    return res.status(200).json({
      success: true,
      statusCode: 200,
      message: 'Roca eliminada correctamente'
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  create,
  obtain,
  obtainById,
  update,
  deleteRock
};
