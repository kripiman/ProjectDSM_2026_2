const { uuidv4 } = require('../utils/uuid');
const { CollectionItem } = require('../models');
const ExperienceService = require('./gamification/experience.service');

class CollectionService {
  /**
   * Registers a recognition of `specimenId` in the user's collection.
   *
   * The first recognition creates the entry (and fixes its discovery date, which is
   * never rewritten); every later one only increments the recognition counter, so a
   * specimen can never appear twice. Must run inside the transaction that stores the
   * analysis: the counter is bumped with an atomic SQL increment.
   *
   * @returns {Promise<object|null>} Summary of the discovery, or null when there is no specimen.
   */
  static async recordRecognition({ userId, specimenId, analysisId, transaction }) {
    if (!specimenId) {
      return null;
    }

    const [item, created] = await CollectionItem.findOrCreate({
      where: { user_id: userId, specimen_id: specimenId },
      defaults: {
        id: uuidv4(),
        analysis_id: analysisId,
        discovered_at: new Date(),
        occurrences_count: 1
      },
      transaction
    });

    if (created) {
      await ExperienceService.award(userId, ExperienceService.DISCOVERY_XP, { transaction });
    } else {
      await item.increment('occurrences_count', { by: 1, transaction });
      await item.reload({ transaction });
    }

    return {
      collection_item_id: item.id,
      specimen_id: specimenId,
      is_new_discovery: created,
      occurrences_count: item.occurrences_count,
      additional_recognitions: item.additional_recognitions,
      discovered_at: item.discovered_at
    };
  }
}

module.exports = CollectionService;
