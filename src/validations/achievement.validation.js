const { z } = require('zod');
const { ACHIEVEMENT_CONDITIONS } = require('../config/constants');
const { emptyToUndefined, strictInteger, atLeastOneField } = require('./common.validation');

const ACHIEVEMENT_STATUSES = ['all', 'unlocked', 'locked'];

const listAchievementsQuery = z.object({
  status: z.preprocess(
    emptyToUndefined,
    z.enum(ACHIEVEMENT_STATUSES, { error: `status must be one of: ${ACHIEVEMENT_STATUSES.join(', ')}` }).default('all')
  )
});

// `condition_value` travels as text whatever its meaning (category id, minimum score).
const conditionValueField = z.preprocess(
  (value) => (value === undefined || value === null || value === '' ? null : String(value).trim()),
  z.string().max(40).nullable()
);

const MAX_COUNT = 1000000;

const achievementFields = {
  title: z.string({ error: 'title is required' }).trim().min(3, 'title must be at least 3 characters').max(100),
  description: z.string({ error: 'description is required' }).trim().min(3, 'description must be at least 3 characters').max(500),
  category: z.string({ error: 'category is required' }).trim().toLowerCase().min(2).max(40),
  icon_url: z.string().trim().max(500).nullable(),
  condition_type: z.enum(Object.values(ACHIEVEMENT_CONDITIONS), {
    error: `condition_type must be one of: ${Object.values(ACHIEVEMENT_CONDITIONS).join(', ')}`
  }),
  condition_value: conditionValueField,
  required_count: strictInteger('required_count', { min: 1, max: MAX_COUNT }),
  xp_reward: strictInteger('xp_reward', { min: 0, max: MAX_COUNT }),
  is_active: z.boolean({ error: 'is_active must be true or false' })
};

const createAchievementSchema = z.object({
  code: z.string({ error: 'code is required' })
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_]{3,40}$/, 'code must have 3-40 characters: letters, numbers and "_"'),
  title: achievementFields.title,
  description: achievementFields.description,
  category: achievementFields.category.default('discovery'),
  icon_url: achievementFields.icon_url.optional(),
  condition_type: achievementFields.condition_type,
  condition_value: achievementFields.condition_value.optional(),
  required_count: achievementFields.required_count.optional().default(1),
  xp_reward: achievementFields.xp_reward.optional().default(50),
  is_active: achievementFields.is_active.default(true)
});

// The code identifies the achievement and cannot be changed afterwards.
const updateAchievementSchema = atLeastOneField(
  z.object({
    title: achievementFields.title.optional(),
    description: achievementFields.description.optional(),
    category: achievementFields.category.optional(),
    icon_url: achievementFields.icon_url.optional(),
    condition_type: achievementFields.condition_type.optional(),
    condition_value: achievementFields.condition_value.optional(),
    required_count: achievementFields.required_count.optional(),
    xp_reward: achievementFields.xp_reward.optional(),
    is_active: achievementFields.is_active.optional()
  }),
  'At least one field to update is required'
);

module.exports = {
  listAchievementsQuery,
  createAchievementSchema,
  updateAchievementSchema
};
