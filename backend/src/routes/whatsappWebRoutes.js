const express = require('express');
const { requireAuth } = require('../middleware/auth');
const controller = require('../controllers/whatsappWebController');

const router = express.Router();

// La sesión de WhatsApp es de cada artista y equivale a acceso a su cuenta.
router.use(requireAuth);

router.get('/', controller.status);
router.post('/link', controller.link);
router.post('/test', controller.test);
router.post('/unlink', controller.unlink);

module.exports = router;
