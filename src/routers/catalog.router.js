const { Router } = require('express');
const { listSpecimens, getSpecimenById, getCategories } = require('../controllers/catalog.controller');

const router = Router();

router.get('/categories', getCategories);
router.get('/', listSpecimens);
router.get('/:id', getSpecimenById);

module.exports = router;
