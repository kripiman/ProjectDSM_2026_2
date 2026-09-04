const { Router } = require('express');
const { listQuizzes, getQuizById, submitQuiz } = require('../controllers/quiz.controller');
const { requireAuth } = require('../middlewares/auth.middleware');

const router = Router();

router.use(requireAuth);

router.get('/', listQuizzes);
router.get('/:id', getQuizById);
router.post('/:id/submit', submitQuiz);

module.exports = router;
