const { z } = require('zod');
const { FEEDBACK_RATINGS } = require('../config/constants');
const { paginationShape, atLeastOneField } = require('./common.validation');

const ratings = Object.values(FEEDBACK_RATINGS);

// Empty strings sent by forms mean "nothing".
const optionalText = (maxLength) => z.preprocess(
  (value) => (value === '' ? null : value),
  z.string().trim().max(maxLength).nullable().optional()
);

const ratingField = z.enum(ratings, { error: `Rating must be one of: ${ratings.join(', ')}` });

const createFeedbackSchema = z.object({
  rating: ratingField,
  comments: optionalText(1000),
  suggested_specimen_id: optionalText(100)
});

const updateFeedbackSchema = atLeastOneField(
  z.object({
    rating: ratingField.optional(),
    comments: optionalText(1000),
    suggested_specimen_id: optionalText(100)
  }),
  'At least one field (rating, comments, suggested_specimen_id) is required'
);

const listFeedbackQuery = z.object({
  ...paginationShape({ defaultLimit: 20 })
});

module.exports = {
  createFeedbackSchema,
  updateFeedbackSchema,
  listFeedbackQuery
};
