const { Op } = require('sequelize');
const { Specimen } = require('../models');
const { successResponse } = require('../utils/response_formatter');
const { AppError } = require('../middlewares/error.middleware');
const { ERROR_CODES, SPECIMEN_CATEGORIES } = require('../config/constants');

const listSpecimens = async (req, res, next) => {
  try {
    const {
      category,
      rarity,
      magnetism,
      q,
      page = 1,
      limit = 20
    } = req.query;

    const where = { is_active: true };

    if (category) {
      where.category = category;
    }

    if (rarity) {
      where.rarity = rarity;
    }

    if (magnetism !== undefined) {
      where.magnetism = magnetism === 'true' || magnetism === '1';
    }

    if (q) {
      where[Op.or] = [
        { name_es: { [Op.like]: `%${q}%` } },
        { name_en: { [Op.like]: `%${q}%` } },
        { scientific_name: { [Op.like]: `%${q}%` } },
        { chemical_formula: { [Op.like]: `%${q}%` } }
      ];
    }

    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const { count, rows } = await Specimen.findAndCountAll({
      where,
      limit: parseInt(limit, 10),
      offset,
      order: [['name_es', 'ASC']]
    });

    return successResponse(res, {
      total: count,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      total_pages: Math.ceil(count / parseInt(limit, 10)),
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
      where: { id, is_active: true }
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
    const categories = Object.values(SPECIMEN_CATEGORIES);
    const summary = [];

    for (const cat of categories) {
      const count = await Specimen.count({ where: { category: cat, is_active: true } });
      summary.push({
        category: cat,
        total_specimens: count
      });
    }

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
