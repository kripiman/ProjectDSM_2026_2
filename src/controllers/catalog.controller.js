const { fn, col } = require('sequelize');
const { Specimen, Category } = require('../models');
const CatalogService = require('../services/catalog.service');
const { successResponse } = require('../utils/response_formatter');
const { AppError } = require('../utils/app_error');
const { ERROR_CODES } = require('../config/constants');
const { buildPagination } = require('../utils/pagination');

const listSpecimens = async (req, res, next) => {
  try {
    const { page, limit, ...filters } = req.validatedQuery;

    const { total, rows } = await CatalogService.list(filters, { page, limit });

    return successResponse(res, {
      total,
      ...buildPagination({ page, limit }, total),
      specimens: rows
    }, 'Specimens retrieved successfully');
  } catch (error) {
    next(error);
  }
};

const getSpecimenById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const specimen = await Specimen.findOne({
      where: { id, is_active: true },
      include: CatalogService.relations()
    });

    if (!specimen) {
      throw new AppError(404, `Specimen with ID '${id}' not found`, ERROR_CODES.NOT_FOUND);
    }

    return successResponse(res, specimen, 'Specimen profile retrieved successfully');
  } catch (error) {
    next(error);
  }
};

const getCategories = async (req, res, next) => {
  try {
    const [categories, counts] = await Promise.all([
      Category.findAll({ order: [['name', 'ASC']] }),
      Specimen.findAll({
        where: { is_active: true },
        attributes: ['category_id', [fn('COUNT', col('id')), 'total']],
        group: ['category_id'],
        raw: true
      })
    ]);

    const totals = new Map(counts.map((row) => [row.category_id, Number(row.total)]));
    const summary = categories.map((category) => ({
      category_id: category.id,
      category: category.name,
      description: category.description,
      total_specimens: totals.get(category.id) || 0
    }));

    return successResponse(res, summary, 'Taxonomy categories retrieved successfully');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  listSpecimens,
  getSpecimenById,
  getCategories
};
