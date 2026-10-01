const { uuidv4 } = require('../utils/uuid');
const PipelineService = require('../services/analysis/pipeline.service');
const AchievementService = require('../services/gamification/achievement.service');
const RefinementService = require('../services/analysis/refinement.service');
const { Analysis, AnalysisCandidate, AnalysisRefinement, Specimen, sequelize } = require('../models');
const env = require('../config/env');
const { successResponse } = require('../utils/response_formatter');
const { AppError } = require('../utils/app_error');
const { ERROR_CODES, USER_ROLES, ACHIEVEMENT_TRIGGERS, REFINEMENT_STATUS } = require('../config/constants');
const { buildPagination, toPageWindow } = require('../utils/pagination');
const { sendStoredImage } = require('../utils/uploads');

/**
 * Recognitions are private to their owner; administrators may review them.
 */
const assertCanView = (analysis, id, user) => {
  if (!analysis) {
    throw new AppError(404, `Analysis with ID '${id}' not found`, ERROR_CODES.NOT_FOUND);
  }
  if (analysis.user_id !== user.id && user.role !== USER_ROLES.ADMIN) {
    throw new AppError(403, 'You do not have access to this analysis', ERROR_CODES.FORBIDDEN);
  }
};

const analyzeImage = async (req, res, next) => {
  try {
    if (!req.file) {
      throw new AppError(400, 'Image file is required under field "image"', ERROR_CODES.VALIDATION_ERROR);
    }

    // A rejected request (for instance a 422 non-specimen image) has its file removed
    // by the error handler.
    const result = await PipelineService.processImage({
      userId: req.user.id,
      filePath: req.file.path,
      mimeType: req.file.mimetype,
      originalFilename: req.file.originalname || req.file.filename,
      storedFilename: req.file.filename,
      simulateFlag: req.query.simulate_non_specimen || req.body.simulate_non_specimen
    });

    return successResponse(res, result, 'Image analyzed successfully', 200);
  } catch (error) {
    next(error);
  }
};

/**
 * Recognition history of the authenticated user (registered or guest session).
 */
const listMyAnalyses = async (req, res, next) => {
  try {
    const window = toPageWindow(req.validatedQuery);

    const { count, rows } = await Analysis.findAndCountAll({
      where: { user_id: req.user.id },
      attributes: { exclude: ['raw_ai_response', 'extracted_features'] },
      include: [{
        model: Specimen,
        as: 'primary_specimen',
        attributes: ['id', 'name_es', 'name_en', 'category', 'thumbnail_url']
      }],
      order: [['createdAt', 'DESC']],
      limit: window.limit,
      offset: window.offset
    });

    return successResponse(res, {
      analyses: rows,
      pagination: buildPagination(window, count)
    }, 'Recognition history retrieved successfully');
  } catch (error) {
    next(error);
  }
};

const getAnalysisById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const analysis = await Analysis.findByPk(id, {
      include: [
        {
          model: AnalysisCandidate,
          as: 'candidates',
          include: [{ model: Specimen, as: 'specimen' }]
        },
        {
          model: Specimen,
          as: 'primary_specimen'
        },
        {
          model: AnalysisRefinement,
          as: 'refinements'
        }
      ]
    });

    assertCanView(analysis, id, req.user);

    return successResponse(res, analysis, 'Analysis details retrieved successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * Sends the photo of a recognition. Photos are not served as public files: the client
 * asks for them with its Bearer token like for any other call, and only the owner and
 * administrators get them.
 */
const getAnalysisImage = async (req, res, next) => {
  try {
    const { id } = req.params;
    const analysis = await Analysis.findByPk(id, { attributes: ['id', 'user_id', 'image_file'] });
    assertCanView(analysis, id, req.user);

    await sendStoredImage(res, env.UPLOAD_DIR, analysis.image_file);
  } catch (error) {
    next(error);
  }
};

const refineAnalysis = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { answers } = req.body; // Array of { question_type: 'hardness'|'streak'|'magnetism'|'luster', user_answer: '...' }

    const { updatedCandidates, unlockedAchievements } = await sequelize.transaction(async (transaction) => {
      const analysis = await Analysis.findByPk(id, {
        include: [{
          model: AnalysisCandidate,
          as: 'candidates',
          include: [{ model: Specimen, as: 'specimen' }]
        }],
        transaction
      });

      if (!analysis) {
        throw new AppError(404, `Analysis with ID '${id}' not found`, ERROR_CODES.NOT_FOUND);
      }

      // Only the person who made the recognition can refine it: doing so changes
      // its scores and counts towards their achievements.
      if (analysis.user_id !== req.user.id) {
        throw new AppError(403, 'You do not have access to this analysis', ERROR_CODES.FORBIDDEN);
      }

      // Save refinement answers (HU-06), each with the effect it had on the selected candidate.
      const selected = analysis.candidates.find((candidate) => candidate.is_selected);
      for (const ans of answers) {
        const effect = selected && selected.specimen ? RefinementService.scoreAnswer(selected.specimen, ans) : null;
        await AnalysisRefinement.create({
          id: uuidv4(),
          analysis_id: id,
          question_type: ans.question_type,
          user_answer: ans.user_answer,
          confidence_delta: effect ? effect.delta : 0
        }, { transaction });
      }

      // Adjust candidate scores based on refinement
      for (const cand of analysis.candidates) {
        if (!cand.specimen) {
          continue;
        }
        RefinementService.applyAnswers(cand, cand.specimen, answers);
        await cand.save({ transaction });
      }

      analysis.refinement_status = REFINEMENT_STATUS.REFINED;
      await analysis.save({ transaction });

      const unlocked = await AchievementService.evaluate(req.user.id, ACHIEVEMENT_TRIGGERS.REFINEMENT, { transaction });

      // Re-fetch updated candidates
      const candidates = await AnalysisCandidate.findAll({
        where: { analysis_id: id },
        order: [['confidence_score', 'DESC']],
        include: [{ model: Specimen, as: 'specimen' }],
        transaction
      });

      return { updatedCandidates: candidates, unlockedAchievements: unlocked };
    });

    return successResponse(res, {
      analysis_id: id,
      refinement_status: REFINEMENT_STATUS.REFINED,
      updated_candidates: updatedCandidates,
      unlocked_achievements: unlockedAchievements
    }, 'Analysis refined successfully');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  analyzeImage,
  listMyAnalyses,
  getAnalysisById,
  getAnalysisImage,
  refineAnalysis
};
