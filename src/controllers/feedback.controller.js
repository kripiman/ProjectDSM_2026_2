const { uuidv4 } = require('../utils/uuid');
const { Feedback, Analysis, Specimen } = require('../models');
const { successResponse } = require('../utils/response_formatter');
const { AppError } = require('../middlewares/error.middleware');
const { ERROR_CODES, FEEDBACK_RATINGS } = require('../config/constants');

const submitFeedback = async (req, res, next) => {
  try {
    const userId = req.user ? req.user.id : null;
    const { id } = req.params; // analysis_id
    const { rating, suggested_specimen_id, comments } = req.body;

    if (!rating || !Object.values(FEEDBACK_RATINGS).includes(rating)) {
      throw new AppError(400, `Rating must be one of: ${Object.values(FEEDBACK_RATINGS).join(', ')}`, ERROR_CODES.VALIDATION_ERROR);
    }

    const analysis = await Analysis.findByPk(id);
    if (!analysis) {
      throw new AppError(404, `Analysis with ID '${id}' not found`, ERROR_CODES.NOT_FOUND);
    }

    if (suggested_specimen_id) {
      const suggested = await Specimen.findByPk(suggested_specimen_id);
      if (!suggested) {
        throw new AppError(404, `Suggested specimen '${suggested_specimen_id}' not found`, ERROR_CODES.NOT_FOUND);
      }
    }

    const feedback = await Feedback.create({
      id: uuidv4(),
      analysis_id: id,
      user_id: userId,
      rating,
      suggested_specimen_id: suggested_specimen_id || null,
      comments: comments || null
    });

    return successResponse(res, feedback, 'Feedback submitted successfully', 201);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  submitFeedback
};
