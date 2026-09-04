const { Router } = require('express');
const {
  addToCollection,
  getCollection,
  getProgress,
  removeFromCollection
} = require('../controllers/collection.controller');
const { requireAuth } = require('../middlewares/auth.middleware');

const router = Router();

router.use(requireAuth);

router.post('/', addToCollection);
router.get('/', getCollection);
router.get('/progress', getProgress);
router.delete('/:id', removeFromCollection);

module.exports = router;
