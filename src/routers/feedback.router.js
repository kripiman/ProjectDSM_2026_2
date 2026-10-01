const { Router } = require('express');
const { createFeedback, getFeedback, updateFeedback, listMyFeedback } = require('../controllers/feedback.controller');
const { requireAuth, authorize, requireRegistered } = require('../middlewares/auth.middleware');
const { validate } = require('../middlewares/validate.middleware');
const { createFeedbackSchema, updateFeedbackSchema, listFeedbackQuery } = require('../validations/feedback.validation');
const { USER_ROLES } = require('../config/constants');

const router = Router();

// Evaluating recognitions is reserved for registered accounts: guest sessions, which
// also hold a valid token, are rejected.
router.use(requireAuth, authorize(USER_ROLES.USER, USER_ROLES.ADMIN), requireRegistered);

router.get('/me', validate(listFeedbackQuery, 'query'), listMyFeedback);
router.post('/analysis/:analysisId', validate(createFeedbackSchema), createFeedback);
router.get('/analysis/:analysisId', getFeedback);
router.put('/analysis/:analysisId', validate(updateFeedbackSchema), updateFeedback);

module.exports = router;
