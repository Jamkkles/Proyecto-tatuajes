const express = require('express');
const { login, register, forgotPassword, resetPassword } = require('../controllers/authController');

const { createAuthLimiter } = require('../middleware/security');

const router = express.Router();

// Todas las rutas de autenticación comparten el límite de intentos por IP.
router.use(createAuthLimiter());

router.post('/login', login);
router.post('/register', register);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

module.exports = router;
