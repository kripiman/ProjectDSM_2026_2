const { Router } = require('express');
const { getProfile, updateProfile, getPreferences, updatePreferences } = require('../controllers/user.controller');
const { requireAuth } = require('../middlewares/auth.middleware');
const { validate } = require('../middlewares/validate.middleware');
const { updateProfileSchema, updatePreferencesSchema } = require('../validations/user.validation');

const router = Router();

router.get('/profile', requireAuth, getProfile);
router.patch('/profile', requireAuth, validate(updateProfileSchema), updateProfile);
router.get('/preferences', requireAuth, getPreferences);
router.put('/preferences', requireAuth, validate(updatePreferencesSchema), updatePreferences);

module.exports = router;
