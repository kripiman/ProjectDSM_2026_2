const { Router } = require('express');
const {
  analyzeImage, listMyAnalyses, getAnalysisById, getAnalysisImage, refineAnalysis
} = require('../controllers/analysis.controller');
const { requireAuth } = require('../middlewares/auth.middleware');
const { checkGuestQuota } = require('../middlewares/guest_quota.middleware');
const { upload } = require('../middlewares/upload.middleware');
const { validate } = require('../middlewares/validate.middleware');
const { refineAnalysisSchema, listAnalysisQuery } = require('../validations/analysis.validation');

const router = Router();

// The guest quota is checked before the upload middleware so a session without
// recognitions left never gets its image stored.
router.post('/', requireAuth, checkGuestQuota, upload.single('image'), analyzeImage);
router.get('/', requireAuth, validate(listAnalysisQuery, 'query'), listMyAnalyses);
router.get('/:id', requireAuth, getAnalysisById);
router.get('/:id/image', requireAuth, getAnalysisImage);
router.post('/:id/refine', requireAuth, validate(refineAnalysisSchema), refineAnalysis);

module.exports = router;
