const { CollectionItem, Specimen, Analysis } = require('../models');
const CatalogService = require('../services/catalog.service');
const StatsService = require('../services/stats.service');
const { successResponse } = require('../utils/response_formatter');
const { AppError } = require('../utils/app_error');
const { ERROR_CODES } = require('../config/constants');

const RECOGNITION_HISTORY_LIMIT = 20;

const notDiscovered = (specimenId) => new AppError(
  404,
  `Specimen '${specimenId}' has not been discovered yet`,
  ERROR_CODES.NOT_FOUND
);

/**
 * The user's own collection. Entries are created automatically when a recognition
 * identifies a specimen, so this endpoint only reads them.
 */
const getCollection = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { include_locked: includeLocked, category, category_id: categoryId, favorite } = req.validatedQuery;

    const specimenWhere = await CatalogService.buildWhere({ category, category_id: categoryId });

    const userItems = await CollectionItem.findAll({
      where: { user_id: userId },
      include: [{
        model: Specimen,
        as: 'specimen',
        required: true,
        where: specimenWhere,
        include: CatalogService.relations()
      }],
      order: [['discovered_at', 'DESC']]
    });

    // The favorite filter only narrows what is listed: it never changes whether a
    // specimen counts as discovered.
    const matchesFavorite = (isFavorite) => favorite === undefined || isFavorite === favorite;

    if (includeLocked) {
      // HU-12: show discovered and locked specimens
      const allSpecimens = await Specimen.findAll({ where: specimenWhere, order: [['name_es', 'ASC']] });
      const discoveredMap = new Map(userItems.map((item) => [item.specimen_id, item]));

      const fullList = allSpecimens.map((specimen) => {
        const discoveredItem = discoveredMap.get(specimen.id);
        return {
          specimen_id: specimen.id,
          name_es: specimen.name_es,
          name_en: specimen.name_en,
          category: specimen.category,
          category_id: specimen.category_id,
          type_id: specimen.type_id,
          rarity: specimen.rarity,
          thumbnail_url: specimen.thumbnail_url,
          is_discovered: Boolean(discoveredItem),
          discovered_at: discoveredItem ? discoveredItem.discovered_at : null,
          occurrences_count: discoveredItem ? discoveredItem.occurrences_count : 0,
          additional_recognitions: discoveredItem ? discoveredItem.additional_recognitions : 0,
          is_favorite: discoveredItem ? discoveredItem.is_favorite : false,
          notes: discoveredItem ? discoveredItem.notes : null
        };
      }).filter((entry) => matchesFavorite(entry.is_favorite));

      return successResponse(res, fullList, 'Full collection with locked status retrieved');
    }

    return successResponse(res, userItems.filter((item) => matchesFavorite(item.is_favorite)), 'User collection retrieved successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * Discovery progress, achievements and activity history of the authenticated user.
 */
const getProgress = async (req, res, next) => {
  try {
    const { activity_limit: activityLimit } = req.validatedQuery;
    const progress = await StatsService.getUserProgress(req.user, { activityLimit });

    return successResponse(res, progress, 'Collection progress retrieved successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * Details of a discovered specimen: the catalog entry, when it was first found, how
 * many times it was recognised since and the recognitions behind it.
 */
const getCollectionItem = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { specimenId } = req.params;

    const item = await CollectionItem.findOne({
      where: { user_id: userId, specimen_id: specimenId },
      include: [{
        model: Specimen,
        as: 'specimen',
        required: true,
        include: CatalogService.relations()
      }]
    });

    if (!item) {
      throw notDiscovered(specimenId);
    }

    const recognitions = await Analysis.findAll({
      where: { user_id: userId, primary_specimen_id: specimenId },
      attributes: ['id', 'image_url', 'ai_confidence', 'provider_used', 'createdAt'],
      order: [['createdAt', 'DESC']],
      limit: RECOGNITION_HISTORY_LIMIT
    });

    return successResponse(res, {
      ...item.toJSON(),
      recognitions
    }, 'Discovery details retrieved successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * Lets the owner annotate a discovery (notes, favorite flag, own photo). The entry
 * itself, its discovery date and its counters are managed by the recognitions.
 */
const updateCollectionItem = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { specimenId } = req.params;

    const item = await CollectionItem.findOne({ where: { user_id: userId, specimen_id: specimenId } });
    if (!item) {
      throw notDiscovered(specimenId);
    }

    await item.update(req.body);

    const fullItem = await CollectionItem.findByPk(item.id, {
      include: [{ model: Specimen, as: 'specimen', include: CatalogService.relations() }]
    });

    return successResponse(res, fullItem, 'Collection item updated');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getCollection,
  getProgress,
  getCollectionItem,
  updateCollectionItem
};
