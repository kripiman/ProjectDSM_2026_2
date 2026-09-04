const { Router } = require('express');

const authRouter = require('./auth.router');
const userRouter = require('./user.router');
const catalogRouter = require('./catalog.router');
const analysisRouter = require('./analysis.router');
const collectionRouter = require('./collection.router');
const achievementRouter = require('./achievement.router');
const quizRouter = require('./quiz.router');
const feedbackRouter = require('./feedback.router');
const eventRouter = require('./event.router');

const router = Router();

router.use('/auth', authRouter);
router.use('/user', userRouter);
router.use('/specimen', catalogRouter);
router.use('/analysis', analysisRouter);
router.use('/collection', collectionRouter);
router.use('/achievement', achievementRouter);
router.use('/quiz', quizRouter);
router.use('/feedback', feedbackRouter);
router.use('/event', eventRouter);

module.exports = router;
