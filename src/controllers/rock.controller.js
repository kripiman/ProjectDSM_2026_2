const { Op } = require('sequelize');
const { Specimen, Category, Type } = require('../models');
const { uuidv4 } = require('../utils/uuid');
const { AppError } = require('../middlewares/error.middleware');
const { ERROR_CODES } = require('../config/constants');

/**
 * Creates a new rock/specimen record with normalized attributes.
 */
const create = async (req, res, next) => {
  try {
    const validatedData = req.body;
    const resolvedName = validatedData.name_es;
    const resolvedScientific = validatedData.scientific_name;

    const existingRock = await Specimen.findOne({
      where: {
        scientific_name: resolvedScientific,
        is_deleted: false
      }
    });

    if (existingRock) {
      throw new AppError(400, 'No puede añadir una roca que ya esté en el sistema.', ERROR_CODES.VALIDATION_ERROR);
    }

    const rockId = validatedData.id || (
      resolvedName.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + uuidv4().substring(0, 6)
    );

    const rock = await Specimen.create({
      ...validatedData,
      id: rockId,
      name_en: validatedData.name_en || resolvedName,
      scientific_name: resolvedScientific,
      is_active: true,
      is_deleted: false
    });

    return res.status(201).json({
      success: true,
      statusCode: 201,
      message: 'Se ha añadido satisfactoriamente la roca.',
      data: { rock },
      rock
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Retrieves all active rocks including category and type relations.
 */
const obtain = async (req, res, next) => {
  try {
    const rocks = await Specimen.findAll({
      where: { is_deleted: false },
      include: [
        { model: Category, as: 'category_rel', required: false },
        { model: Type, as: 'type_rel', required: false }
      ]
    });

    return res.status(200).json({
      success: true,
      statusCode: 200,
      message: 'Rocas obtenidas satisfactoriamente.',
      data: { rocks },
      rocks
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
    const rock = await Specimen.findOne({
      where: {
        [Op.or]: [
          { id },
          { catalog_index: Number.isNaN(Number(id)) ? -1 : Number(id) }
        ],
        is_deleted: false
      },
      include: [
        { model: Category, as: 'category_rel', required: false },
        { model: Type, as: 'type_rel', required: false }
      ]
    });

    if (!rock) {
      throw new AppError(404, 'Roca no encontrada', ERROR_CODES.NOT_FOUND);
    }

    return res.status(200).json({
      success: true,
      statusCode: 200,
      data: { rock },
      rock
    });
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
    const rock = await Specimen.findOne({
      where: { id, is_deleted: false }
    });

    if (!rock) {
      throw new AppError(404, 'Roca no encontrada', ERROR_CODES.NOT_FOUND);
    }

    await rock.update(req.body);

    return res.status(200).json({
      success: true,
      statusCode: 200,
      message: 'Roca actualizada correctamente',
      data: { rock },
      rock
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Dual soft delete: marks is_deleted flag and invokes paranoid destroy for timestamp.
 */
const deleteRock = async (req, res, next) => {
  try {
    const { id } = req.params;
    const rock = await Specimen.findOne({
      where: { id, is_deleted: false }
    });

    if (!rock) {
      throw new AppError(404, 'Roca no encontrada', ERROR_CODES.NOT_FOUND);
    }

    rock.is_deleted = true;
    await rock.save();
    await rock.destroy();

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
