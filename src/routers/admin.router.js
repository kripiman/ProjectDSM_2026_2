const { Router } = require('express');
const admin = require('../controllers/admin.controller');
const achievements = require('../controllers/achievement.controller');
const { requireAuth, authorize } = require('../middlewares/auth.middleware');
const { validate } = require('../middlewares/validate.middleware');
const {
  listUsersQuery,
  changeRoleSchema,
  changeStatusSchema,
  statsQuery,
  historyQuery,
  adminFeedbackQuery
} = require('../validations/admin.validation');
const { createAchievementSchema, updateAchievementSchema } = require('../validations/achievement.validation');
const { USER_ROLES } = require('../config/constants');

const router = Router();

// Every administrative operation requires a valid session *and* the admin role.
router.use(requireAuth, authorize(USER_ROLES.ADMIN));

// Users
router.get('/users', validate(listUsersQuery, 'query'), admin.listUsers);
router.get('/users/:id', admin.getUser);
router.get('/users/:id/collection', admin.getUserCollection);
router.get('/users/:id/achievements', admin.getUserAchievements);
router.patch('/users/:id/role', validate(changeRoleSchema), admin.changeUserRole);
router.patch('/users/:id/status', validate(changeStatusSchema), admin.changeUserStatus);

// Supervision
router.get('/stats', validate(statsQuery, 'query'), admin.getStats);
router.get('/history', validate(historyQuery, 'query'), admin.getHistory);
router.get('/feedback', validate(adminFeedbackQuery, 'query'), admin.listFeedback);

// Achievements (DELETE deactivates: unlock history is preserved)
router.get('/achievements', achievements.adminListAchievements);
router.post('/achievements', validate(createAchievementSchema), achievements.adminCreateAchievement);
router.get('/achievements/:id', achievements.adminGetAchievement);
router.put('/achievements/:id', validate(updateAchievementSchema), achievements.adminUpdateAchievement);
router.patch('/achievements/:id', validate(updateAchievementSchema), achievements.adminUpdateAchievement);
router.delete('/achievements/:id', achievements.adminDeactivateAchievement);

module.exports = router;
