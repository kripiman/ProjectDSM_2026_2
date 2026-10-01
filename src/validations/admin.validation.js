const { z } = require('zod');
const { USER_ROLES, USER_STATUS, FEEDBACK_RATINGS, ANALYSIS_STATUS } = require('../config/constants');
const { emptyToUndefined, paginationShape, queryText, queryInt, queryIsoDate } = require('./common.validation');

const optionalEnum = (values, label) => z.preprocess(
  emptyToUndefined,
  z.enum(values, { error: `${label} must be one of: ${values.join(', ')}` }).optional()
);

const listUsersQuery = z.object({
  role: optionalEnum(Object.values(USER_ROLES), 'role'),
  status: optionalEnum(Object.values(USER_STATUS), 'status'),
  // Registered accounts by default; 'all' also lists temporary guest sessions.
  is_anonymous: z.preprocess(
    emptyToUndefined,
    z.enum(['true', 'false', 'all'], { error: 'is_anonymous must be one of: true, false, all' }).default('false')
  ),
  q: queryText(100),
  ...paginationShape({ defaultLimit: 20 })
});

// Administrators change the role of registered accounts between user and admin.
const changeRoleSchema = z.object({
  role: z.enum([USER_ROLES.USER, USER_ROLES.ADMIN], {
    error: `role must be one of: ${USER_ROLES.USER}, ${USER_ROLES.ADMIN}`
  })
});

const changeStatusSchema = z.object({
  status: z.enum(Object.values(USER_STATUS), {
    error: `status must be one of: ${Object.values(USER_STATUS).join(', ')}`
  })
});

const statsQuery = z.object({
  top: queryInt({ min: 1, max: 50 })
});

const historyQuery = z.object({
  user_id: queryText(100),
  specimen_id: queryText(100),
  status: optionalEnum(Object.values(ANALYSIS_STATUS), 'status'),
  from: queryIsoDate,
  to: queryIsoDate,
  ...paginationShape({ defaultLimit: 20 })
});

const adminFeedbackQuery = z.object({
  rating: optionalEnum(Object.values(FEEDBACK_RATINGS), 'rating'),
  user_id: queryText(100),
  ...paginationShape({ defaultLimit: 20 })
});

module.exports = {
  listUsersQuery,
  changeRoleSchema,
  changeStatusSchema,
  statsQuery,
  historyQuery,
  adminFeedbackQuery
};
