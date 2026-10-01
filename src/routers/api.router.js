const { Router } = require('express');

const authRouter = require('./auth.router');
const userRouter = require('./user.router');
const catalogRouter = require('./catalog.router');
const rockRouter = require('./rock.router');
const { buildTaxonomyRouter } = require('./taxonomy.router');
const taxonomyControllers = require('../controllers/taxonomy.controller');
const analysisRouter = require('./analysis.router');
const collectionRouter = require('./collection.router');
const achievementRouter = require('./achievement.router');
const quizRouter = require('./quiz.router');
const feedbackRouter = require('./feedback.router');
const eventRouter = require('./event.router');
const adminRouter = require('./admin.router');

const router = Router();

// Authentication and User routes
router.use('/auth', authRouter);
router.use('/user', userRouter);
router.use('/api/user', authRouter); // Classroom endpoint compatibility

// Specimen and Rock routes
router.use('/specimen', catalogRouter);
router.use('/specimens', catalogRouter);
router.use('/rock', rockRouter);
router.use('/api/rock', rockRouter); // Classroom endpoint compatibility

// Taxonomy of the catalog
router.use('/category', buildTaxonomyRouter(taxonomyControllers.category));
router.use('/type', buildTaxonomyRouter(taxonomyControllers.type));

// Domain routes
router.use('/analysis', analysisRouter);
router.use('/collection', collectionRouter);
router.use('/achievement', achievementRouter);
router.use('/quiz', quizRouter);
router.use('/feedback', feedbackRouter);
router.use('/event', eventRouter);

// Administration (restricted to administrators)
router.use('/admin', adminRouter);

module.exports = router;
