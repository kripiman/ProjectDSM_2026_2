const { Router } = require('express');
const { create, obtain, obtainById, update, deleteRock } = require('../controllers/rock.controller');
const { requireAuth, optionalAuth, authorize } = require('../middlewares/auth.middleware');
const { rockImageUpload, attachUploadedRockImage } = require('../middlewares/upload.middleware');
const { rejectNullBytes } = require('../middlewares/null_bytes.middleware');
const { validate } = require('../middlewares/validate.middleware');
const { createRockSchema, updateRockSchema, listRocksQuery } = require('../validations/rock.validation');
const { USER_ROLES } = require('../config/constants');

const router = Router();

// Reading the catalog is public; every change is reserved for administrators. Their
// authorization is resolved first so that nothing is written to disk for a request
// that will be rejected. A rock may come with an image URL or an image file
// (multipart field "image").
const adminOnly = [requireAuth, authorize(USER_ROLES.ADMIN)];
const withImage = [rockImageUpload.single('image'), attachUploadedRockImage, rejectNullBytes];

// Classroom-compatible RPC routes
router.post('/agregar', ...adminOnly, ...withImage, validate(createRockSchema), create);
router.patch('/actualizar/:id', ...adminOnly, ...withImage, validate(updateRockSchema), update);
router.delete('/eliminar/:id', ...adminOnly, deleteRock);

// Standard REST routes
router.post('/', ...adminOnly, ...withImage, validate(createRockSchema), create);
router.get('/', optionalAuth, validate(listRocksQuery, 'query'), obtain);
router.get('/:id', optionalAuth, obtainById);
router.patch('/:id', ...adminOnly, ...withImage, validate(updateRockSchema), update);
router.put('/:id', ...adminOnly, ...withImage, validate(updateRockSchema), update);
router.delete('/:id', ...adminOnly, deleteRock);

module.exports = router;
