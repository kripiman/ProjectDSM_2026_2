const { Router } = require('express');
const { listAchievements } = require('../controllers/achievement.controller');
const { requireAuth } = require('../middlewares/auth.middleware');
const { validate } = require('../middlewares/validate.middleware');
const { listAchievementsQuery } = require('../validations/achievement.validation');

const router = Router();

router.get('/', requireAuth, validate(listAchievementsQuery, 'query'), listAchievements);

module.exports = router;
