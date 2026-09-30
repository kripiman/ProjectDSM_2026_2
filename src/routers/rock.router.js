const { Router } = require('express');
const { create, obtain, obtainById, update, deleteRock } = require('../controllers/rock.controller');
const { validate } = require('../middlewares/validate.middleware');
const { createRockSchema, updateRockSchema } = require('../validations/rock.validation');

const router = Router();

// Classroom-compatible RPC routes
router.post('/agregar', validate(createRockSchema), create);
router.patch('/actualizar/:id', validate(updateRockSchema), update);
router.delete('/eliminar/:id', deleteRock);

// Standard REST routes
router.post('/', validate(createRockSchema), create);
router.get('/', obtain);
router.get('/:id', obtainById);
router.patch('/:id', validate(updateRockSchema), update);
router.put('/:id', validate(updateRockSchema), update);
router.delete('/:id', deleteRock);

module.exports = router;
