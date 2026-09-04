const { Router } = require('express');
const { listAchievements } = require('../controllers/achievement.controller');
const { requireAuth } = require('../middlewares/auth.middleware');

const router = Router();

router.get('/', requireAuth, listAchievements);

module.exports = router;
