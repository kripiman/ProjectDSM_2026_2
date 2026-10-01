const { z } = require('zod');

// `null` means the question was left unanswered.
const submitQuizSchema = z.object({
  answers: z.array(z.object({
    question_id: z.string({ error: 'question_id is required' }).min(1),
    selected_option_index: z.number({ error: 'selected_option_index must be a number' }).int().min(0).nullable()
  }), { error: 'Answers array is required' })
});

module.exports = {
  submitQuizSchema
};
