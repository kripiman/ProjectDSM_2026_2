const { Router } = require('express');
const { listSpecimens, getSpecimenById, getCategories } = require('../controllers/catalog.controller');
const { validate } = require('../middlewares/validate.middleware');
const { listSpecimensQuery } = require('../validations/rock.validation');

const router = Router();

router.get('/categories', getCategories);
router.get('/', validate(listSpecimensQuery, 'query'), listSpecimens);
router.get('/:id', getSpecimenById);

module.exports = router;
