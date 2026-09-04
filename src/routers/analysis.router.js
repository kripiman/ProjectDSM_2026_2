const { Router } = require('express');
const { analyzeImage, getAnalysisById, refineAnalysis } = require('../controllers/analysis.controller');
const { requireAuth } = require('../middlewares/auth.middleware');
const { upload } = require('../middlewares/upload.middleware');

const router = Router();

router.post('/', requireAuth, upload.single('image'), analyzeImage);
router.get('/:id', requireAuth, getAnalysisById);
router.post('/:id/refine', requireAuth, refineAnalysis);

module.exports = router;
