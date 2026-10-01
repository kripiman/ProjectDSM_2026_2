const { z } = require('zod');
const { REFINEMENT_QUESTION_TYPES } = require('../config/constants');
const { paginationShape } = require('./common.validation');

const refineAnalysisSchema = z.object({
  answers: z.array(z.object({
    question_type: z.enum(Object.values(REFINEMENT_QUESTION_TYPES), {
      error: `question_type must be one of: ${Object.values(REFINEMENT_QUESTION_TYPES).join(', ')}`
    }),
    user_answer: z.string({ error: 'user_answer is required' }).trim().min(1, 'user_answer is required').max(200)
  }), { error: 'Answers array is required' })
    .min(1, 'Answers array is required')
    .max(10, 'At most 10 answers can be sent at once')
});

const listAnalysisQuery = z.object({
  ...paginationShape({ defaultLimit: 20 })
});

module.exports = {
  refineAnalysisSchema,
  listAnalysisQuery
};
