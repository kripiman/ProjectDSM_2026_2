const { Router } = require('express');
const {
  getCollection,
  getProgress,
  getCollectionItem,
  updateCollectionItem
} = require('../controllers/collection.controller');
const { requireAuth } = require('../middlewares/auth.middleware');
const { validate } = require('../middlewares/validate.middleware');
const {
  listCollectionQuery,
  progressQuery,
  updateCollectionItemSchema
} = require('../validations/collection.validation');

const router = Router();

router.use(requireAuth);

// Discoveries are registered automatically by POST /analysis: there is no way to add
// or remove entries by hand.
router.get('/', validate(listCollectionQuery, 'query'), getCollection);
// Declared before '/:specimenId' so "progress" is not read as a specimen id.
router.get('/progress', validate(progressQuery, 'query'), getProgress);
router.get('/:specimenId', getCollectionItem);
router.patch('/:specimenId', validate(updateCollectionItemSchema), updateCollectionItem);

module.exports = router;
