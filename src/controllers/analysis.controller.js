const path = require('path');
const { uuidv4 } = require('../utils/uuid');
const PipelineService = require('../services/analysis/pipeline.service');
const { Analysis, AnalysisCandidate, AnalysisRefinement, Specimen, UserAchievement, Achievement } = require('../models');
const { successResponse } = require('../utils/response_formatter');
const { AppError } = require('../middlewares/error.middleware');
const { ERROR_CODES, ANALYSIS_STATUS } = require('../config/constants');

const analyzeImage = async (req, res, next) => {
  try {
    if (!req.file) {
      throw new AppError(400, 'Image file is required under field "image"', ERROR_CODES.VALIDATION_ERROR);
    }

    const userId = req.user.id;
    const filePath = req.file.path;
    const originalFilename = req.file.originalname || req.file.filename;
    const storedFilename = req.file.filename;
    const simulateFlag = req.query.simulate_non_specimen || req.body.simulate_non_specimen;

    const result = await PipelineService.processImage({
      userId,
      filePath,
      originalFilename,
      storedFilename,
      simulateFlag
    });

    // Check achievement: FIRST_SCAN
    const firstScanAchievement = await Achievement.findOne({ where: { code: 'FIRST_SCAN' } });
    if (firstScanAchievement) {
      const [userAch] = await UserAchievement.findOrCreate({
        where: { user_id: userId, achievement_id: firstScanAchievement.id },
        defaults: { id: uuidv4(), current_progress: 1, is_unlocked: true, unlocked_at: new Date() }
      });
      if (!userAch.is_unlocked) {
        userAch.is_unlocked = true;
        userAch.current_progress = 1;
        userAch.unlocked_at = new Date();
        await userAch.save();
      }
    }

    return successResponse(res, result, 'Image analyzed successfully', 200);
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

    if (!analysis) {
      throw new AppError(404, `Analysis with ID '${id}' not found`, ERROR_CODES.NOT_FOUND);
    }

    return successResponse(res, analysis, 'Analysis details retrieved successfully');
  } catch (error) {
    next(error);
  }
};

const refineAnalysis = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { answers } = req.body; // Array of { question_type: 'hardness'|'streak'|'magnetism', user_answer: '...' }

    if (!answers || !Array.isArray(answers) || answers.length === 0) {
      throw new AppError(400, 'Answers array is required', ERROR_CODES.VALIDATION_ERROR);
    }

    const analysis = await Analysis.findByPk(id, {
      include: [{ model: AnalysisCandidate, as: 'candidates' }]
    });

    if (!analysis) {
      throw new AppError(404, `Analysis with ID '${id}' not found`, ERROR_CODES.NOT_FOUND);
    }

    // Save refinement answers (HU-06)
    for (const ans of answers) {
      await AnalysisRefinement.create({
        id: uuidv4(),
        analysis_id: id,
        question_type: ans.question_type,
        user_answer: ans.user_answer,
        confidence_delta: 0.10
      });
    }

    // Adjust candidate scores based on refinement
    for (const cand of analysis.candidates) {
      const specimen = await Specimen.findByPk(cand.specimen_id);
      if (specimen) {
        for (const ans of answers) {
          if (ans.question_type === 'magnetism' && ans.user_answer.includes('magnético')) {
            if (specimen.magnetism) {
              cand.confidence_score = Math.min(0.98, cand.confidence_score + 0.20);
              cand.rationale += ' (Confirmado por magnetismo positivo)';
            } else {
              cand.confidence_score = Math.max(0.10, cand.confidence_score - 0.30);
            }
          }
          if (ans.question_type === 'hardness' && ans.user_answer.includes('vidrio')) {
            if (specimen.mohs_hardness_min >= 6) {
              cand.confidence_score = Math.min(0.98, cand.confidence_score + 0.15);
              cand.rationale += ' (Confirmado dureza alta >= 6)';
            }
          }
        }
        await cand.save();
      }
    }

    analysis.refinement_status = 'refined';
    await analysis.save();

    // Re-fetch updated candidates
    const updatedCandidates = await AnalysisCandidate.findAll({
      where: { analysis_id: id },
      order: [['confidence_score', 'DESC']],
      include: [{ model: Specimen, as: 'specimen' }]
    });

    return successResponse(res, {
      analysis_id: id,
      refinement_status: 'refined',
      updated_candidates: updatedCandidates
    }, 'Analysis refined successfully');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  analyzeImage,
  getAnalysisById,
  refineAnalysis
};
