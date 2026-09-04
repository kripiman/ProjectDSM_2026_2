const { uuidv4 } = require('../utils/uuid');
const { CollectionItem, Specimen, User, Achievement, UserAchievement, Analysis } = require('../models');
const { successResponse } = require('../utils/response_formatter');
const { AppError } = require('../middlewares/error.middleware');
const { ERROR_CODES, SPECIMEN_CATEGORIES } = require('../config/constants');

const addToCollection = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { specimen_id, analysis_id, notes, custom_image_url, is_favorite } = req.body;

    if (!specimen_id) {
      throw new AppError(400, 'specimen_id is required', ERROR_CODES.VALIDATION_ERROR);
    }

    const specimen = await Specimen.findByPk(specimen_id);
    if (!specimen) {
      throw new AppError(404, `Specimen with ID '${specimen_id}' not found`, ERROR_CODES.NOT_FOUND);
    }

    // Check if already in collection
    let item = await CollectionItem.findOne({
      where: { user_id: userId, specimen_id }
    });

    let isNewDiscovery = false;

    if (item) {
      if (notes) item.notes = notes;
      if (custom_image_url) item.custom_image_url = custom_image_url;
      if (is_favorite !== undefined) item.is_favorite = Boolean(is_favorite);
      await item.save();
    } else {
      isNewDiscovery = true;
      item = await CollectionItem.create({
        id: uuidv4(),
        user_id: userId,
        specimen_id,
        analysis_id: analysis_id || null,
        notes: notes || null,
        custom_image_url: custom_image_url || null,
        is_favorite: Boolean(is_favorite)
      });

      // Award XP to user for new discovery
      const user = await User.findByPk(userId);
      if (user) {
        user.experience_points += 25;
        user.current_level = Math.floor(user.experience_points / 100) + 1;
        await user.save();
      }

      // Check achievements
      const totalCollected = await CollectionItem.count({ where: { user_id: userId } });
      const noviceAch = await Achievement.findOne({ where: { code: 'NOVICE_COLLECTOR' } });
      if (noviceAch && totalCollected >= noviceAch.required_count) {
        const [achRecord] = await UserAchievement.findOrCreate({
          where: { user_id: userId, achievement_id: noviceAch.id },
          defaults: { id: uuidv4(), current_progress: totalCollected, is_unlocked: true, unlocked_at: new Date() }
        });
        if (!achRecord.is_unlocked) {
          achRecord.is_unlocked = true;
          achRecord.current_progress = totalCollected;
          achRecord.unlocked_at = new Date();
          await achRecord.save();
        }
      }
    }

    const fullItem = await CollectionItem.findByPk(item.id, {
      include: [{ model: Specimen, as: 'specimen' }]
    });

    return successResponse(res, {
      is_new_discovery: isNewDiscovery,
      collection_item: fullItem
    }, isNewDiscovery ? 'Specimen added to your collection' : 'Collection item updated', isNewDiscovery ? 201 : 200);
  } catch (error) {
    next(error);
  }
};

const getCollection = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { include_locked, category } = req.query;

    const userItems = await CollectionItem.findAll({
      where: { user_id: userId },
      include: [{ model: Specimen, as: 'specimen' }],
      order: [['discovered_at', 'DESC']]
    });

    if (include_locked === 'true' || include_locked === '1') {
      // HU-12: show discovered and locked specimens
      const whereSpecimen = { is_active: true };
      if (category) whereSpecimen.category = category;

      const allSpecimens = await Specimen.findAll({ where: whereSpecimen });
      const discoveredMap = new Map(userItems.map(item => [item.specimen_id, item]));

      const fullList = allSpecimens.map(specimen => {
        const discoveredItem = discoveredMap.get(specimen.id);
        return {
          specimen_id: specimen.id,
          name_es: specimen.name_es,
          name_en: specimen.name_en,
          category: specimen.category,
          rarity: specimen.rarity,
          thumbnail_url: specimen.thumbnail_url,
          is_discovered: Boolean(discoveredItem),
          discovered_at: discoveredItem ? discoveredItem.discovered_at : null,
          is_favorite: discoveredItem ? discoveredItem.is_favorite : false,
          notes: discoveredItem ? discoveredItem.notes : null
        };
      });

      return successResponse(res, fullList, 'Full collection with locked status retrieved');
    }

    return successResponse(res, userItems, 'User collection retrieved successfully');
  } catch (error) {
    next(error);
  }
};

const getProgress = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const allSpecimens = await Specimen.findAll({ where: { is_active: true } });
    const userItems = await CollectionItem.findAll({ where: { user_id: userId } });
    const discoveredIds = new Set(userItems.map(i => i.specimen_id));

    const totalSpecimens = allSpecimens.length;
    const totalDiscovered = discoveredIds.size;
    const overallPercentage = totalSpecimens > 0 ? Math.round((totalDiscovered / totalSpecimens) * 100) : 0;

    const categoryBreakdown = {};

    for (const cat of Object.values(SPECIMEN_CATEGORIES)) {
      const catSpecimens = allSpecimens.filter(s => s.category === cat);
      const catDiscovered = catSpecimens.filter(s => discoveredIds.has(s.id)).length;
      categoryBreakdown[cat] = {
        total: catSpecimens.length,
        discovered: catDiscovered,
        percentage: catSpecimens.length > 0 ? Math.round((catDiscovered / catSpecimens.length) * 100) : 0
      };
    }

    return successResponse(res, {
      total_specimens: totalSpecimens,
      total_discovered: totalDiscovered,
      overall_percentage: overallPercentage,
      categories: categoryBreakdown
    }, 'Collection progress retrieved successfully');
  } catch (error) {
    next(error);
  }
};

const removeFromCollection = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const item = await CollectionItem.findOne({
      where: { id, user_id: userId }
    });

    if (!item) {
      throw new AppError(404, `Collection item with ID '${id}' not found`, ERROR_CODES.NOT_FOUND);
    }

    await item.destroy();
    return successResponse(res, null, 'Specimen removed from collection');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  addToCollection,
  getCollection,
  getProgress,
  removeFromCollection
};
