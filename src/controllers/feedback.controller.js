const { uuidv4 } = require('../utils/uuid');
const { Feedback, Analysis, Specimen, sequelize } = require('../models');
const { successResponse } = require('../utils/response_formatter');
const { AppError } = require('../utils/app_error');
const { ERROR_CODES, USER_ROLES } = require('../config/constants');
const { buildPagination, toPageWindow } = require('../utils/pagination');

const findAnalysisOrFail = async (analysisId, transaction) => {
  const analysis = await Analysis.findByPk(analysisId, { transaction });
  if (!analysis) {
    throw new AppError(404, `Analysis with ID '${analysisId}' not found`, ERROR_CODES.NOT_FOUND);
  }
  return analysis;
};

// Only the person who made a recognition can evaluate it.
const assertOwnsAnalysis = (analysis, user) => {
  if (analysis.user_id !== user.id) {
    throw new AppError(403, 'You can only evaluate your own recognitions', ERROR_CODES.FORBIDDEN);
  }
};

const assertSuggestedSpecimenExists = async (specimenId, transaction) => {
  if (!specimenId) {
    return;
  }
  const suggested = await Specimen.findByPk(specimenId, { transaction });
  if (!suggested) {
    throw new AppError(404, `Suggested specimen '${specimenId}' not found`, ERROR_CODES.NOT_FOUND);
  }
};

const findFeedbackOrFail = async (analysisId, transaction) => {
  const feedback = await Feedback.findOne({ where: { analysis_id: analysisId }, transaction });
  if (!feedback) {
    throw new AppError(404, `No feedback has been submitted for analysis '${analysisId}'`, ERROR_CODES.NOT_FOUND);
  }
  return feedback;
};

/**
 * Evaluates one of the user's own recognitions. A recognition takes at most one
 * evaluation; afterwards it can only be edited.
 */
const createFeedback = async (req, res, next) => {
  try {
    const { analysisId } = req.params;
    const { rating, suggested_specimen_id: suggestedSpecimenId, comments } = req.body;

    const feedback = await sequelize.transaction(async (transaction) => {
      const analysis = await findAnalysisOrFail(analysisId, transaction);
      assertOwnsAnalysis(analysis, req.user);
      await assertSuggestedSpecimenExists(suggestedSpecimenId, transaction);

      const existing = await Feedback.findOne({ where: { analysis_id: analysisId }, transaction });
      if (existing) {
        throw new AppError(
          409,
          'This recognition already has an evaluation. Update it instead of sending a new one.',
          ERROR_CODES.CONFLICT
        );
      }

      return Feedback.create({
        id: uuidv4(),
        analysis_id: analysisId,
        user_id: req.user.id,
        rating,
        suggested_specimen_id: suggestedSpecimenId || null,
        comments: comments || null
      }, { transaction });
    });

    return successResponse(res, feedback, 'Feedback submitted successfully', 201);
  } catch (error) {
    next(error);
  }
};

/**
 * Reads the evaluation of a recognition: its owner and administrators may see it.
 */
const getFeedback = async (req, res, next) => {
  try {
    const { analysisId } = req.params;

    const analysis = await findAnalysisOrFail(analysisId);
    if (analysis.user_id !== req.user.id && req.user.role !== USER_ROLES.ADMIN) {
      throw new AppError(403, 'You do not have access to this feedback', ERROR_CODES.FORBIDDEN);
    }

    const feedback = await findFeedbackOrFail(analysisId);
    return successResponse(res, feedback, 'Feedback retrieved successfully');
  } catch (error) {
    next(error);
  }
};

const updateFeedback = async (req, res, next) => {
  try {
    const { analysisId } = req.params;

    const feedback = await sequelize.transaction(async (transaction) => {
      const analysis = await findAnalysisOrFail(analysisId, transaction);
      assertOwnsAnalysis(analysis, req.user);

      const current = await findFeedbackOrFail(analysisId, transaction);
      await assertSuggestedSpecimenExists(req.body.suggested_specimen_id, transaction);

      await current.update(req.body, { transaction });
      return current;
    });

    return successResponse(res, feedback, 'Feedback updated successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * All the evaluations sent by the authenticated user.
 */
const listMyFeedback = async (req, res, next) => {
  try {
    const window = toPageWindow(req.validatedQuery);

    const { count, rows } = await Feedback.findAndCountAll({
      where: { user_id: req.user.id },
      order: [['createdAt', 'DESC']],
      limit: window.limit,
      offset: window.offset
    });

    return successResponse(res, {
      feedback: rows,
      pagination: buildPagination(window, count)
    }, 'Feedback list retrieved successfully');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createFeedback,
  getFeedback,
  updateFeedback,
  listMyFeedback
};
