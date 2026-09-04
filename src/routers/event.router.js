const { Router } = require('express');
const { logEvent } = require('../controllers/event.controller');
const { optionalAuth } = require('../middlewares/auth.middleware');

const router = Router();

router.post('/', optionalAuth, logEvent);

module.exports = router;
