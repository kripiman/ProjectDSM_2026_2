const { Router } = require('express');
const { createAnonymousSession, register, login, deleteAccount } = require('../controllers/auth.controller');
const { requireAuth } = require('../middlewares/auth.middleware');

const router = Router();

router.post('/anonymous', createAnonymousSession);
router.post('/register', register);
router.post('/login', login);
router.delete('/account', requireAuth, deleteAccount);

module.exports = router;
