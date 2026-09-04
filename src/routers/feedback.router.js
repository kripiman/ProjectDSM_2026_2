const { Router } = require('express');
const { submitFeedback } = require('../controllers/feedback.controller');
const { optionalAuth } = require('../middlewares/auth.middleware');

const router = Router();

router.post('/:id', optionalAuth, submitFeedback);

module.exports = router;
