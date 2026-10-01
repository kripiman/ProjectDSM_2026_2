const { z } = require('zod');
const { imageReference, atLeastOneField } = require('./common.validation');

// Profile changes are limited to a whitelist of harmless fields. Anything else in the
// payload (role, status, is_anonymous, ...) is discarded, so a profile update can
// never be used to gain privileges.
const updateProfileSchema = atLeastOneField(
  z.object({
    display_name: z.string().trim().min(1, 'display_name cannot be empty').max(60).optional(),
    userName: z.string().trim().min(2, 'Username must be at least 2 characters').max(30).optional(),
    phone: z.string().trim().min(3).max(30).optional(),
    avatar_url: imageReference('avatar_url must be an http(s) URL or a path starting with "/"').nullable().optional()
  }),
  'At least one field (display_name, userName, phone, avatar_url) is required'
);

const updatePreferencesSchema = z.object({
  language: z.string().trim().min(2).max(10).optional(),
  theme: z.enum(['light', 'dark', 'system'], { error: 'theme must be one of: light, dark, system' }).optional(),
  reduce_animations: z.boolean({ error: 'reduce_animations must be true or false' }).optional(),
  push_notifications: z.boolean({ error: 'push_notifications must be true or false' }).optional()
});

module.exports = {
  updateProfileSchema,
  updatePreferencesSchema
};
