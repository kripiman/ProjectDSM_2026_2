const { z } = require('zod');
const { queryInt, queryBoolean, queryText, imageReference, atLeastOneField } = require('./common.validation');

const listCollectionQuery = z.object({
  include_locked: queryBoolean,
  category_id: queryInt({ min: 1 }),
  category: queryText(60),
  favorite: queryBoolean
});

const progressQuery = z.object({
  activity_limit: queryInt({ min: 1, max: 100 })
});

// Discoveries are created by recognitions only; a user can annotate what they found.
const updateCollectionItemSchema = atLeastOneField(
  z.object({
    notes: z.string().trim().max(1000, 'Notes must be at most 1000 characters').nullable().optional(),
    is_favorite: z.boolean({ error: 'is_favorite must be true or false' }).optional(),
    custom_image_url: imageReference('custom_image_url must be an http(s) URL or a path starting with "/"')
      .nullable()
      .optional()
  }),
  'At least one field (notes, is_favorite, custom_image_url) is required'
);

module.exports = {
  listCollectionQuery,
  progressQuery,
  updateCollectionItemSchema
};
