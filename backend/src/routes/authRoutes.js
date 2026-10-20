const express = require('express');
const {
  login,
  register,
  forgotPassword,
  resetPassword,
  changePassword,
} = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');

const { createAuthLimiter } = require('../middleware/security');

const router = express.Router();

// Todas las rutas de autenticación comparten el límite de intentos por IP.
router.use(createAuthLimiter());

router.post('/login', login);
router.post('/register', register);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
// Con sesión: cada usuario cambia la suya. Comparte el límite de intentos, así no se puede
// adivinar la contraseña actual a fuerza de probar.
router.post('/change-password', requireAuth, changePassword);

module.exports = router;
