const { Router } = require('express');
const { getProfile, getPreferences, updatePreferences } = require('../controllers/user.controller');
const { requireAuth } = require('../middlewares/auth.middleware');

const router = Router();

router.get('/profile', requireAuth, getProfile);
router.get('/preferences', requireAuth, getPreferences);
router.put('/preferences', requireAuth, updatePreferences);

module.exports = router;
