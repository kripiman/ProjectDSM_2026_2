const { Router } = require('express');
const { listQuizzes, getQuizById, submitQuiz } = require('../controllers/quiz.controller');
const { requireAuth } = require('../middlewares/auth.middleware');
const { validate } = require('../middlewares/validate.middleware');
const { submitQuizSchema } = require('../validations/quiz.validation');

const router = Router();

router.use(requireAuth);

router.get('/', listQuizzes);
router.get('/:id', getQuizById);
router.post('/:id/submit', validate(submitQuizSchema), submitQuiz);

module.exports = router;
