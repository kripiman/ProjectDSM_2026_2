const { Router } = require('express');
const { createAnonymousSession, register, login, deleteAccount } = require('../controllers/auth.controller');
const { requireAuth } = require('../middlewares/auth.middleware');
const { validate } = require('../middlewares/validate.middleware');
const { registerSchema, loginSchema } = require('../validations/auth.validation');

const router = Router();

router.post('/anonymous', createAnonymousSession);
router.post('/register', validate(registerSchema), register);
router.post('/registro', validate(registerSchema), register);
router.post('/login', validate(loginSchema), login);
router.delete('/account', requireAuth, deleteAccount);

module.exports = router;
