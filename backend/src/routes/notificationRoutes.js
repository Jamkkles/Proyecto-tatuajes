const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { list, markRead } = require('../controllers/notificationController');

const router = express.Router();

// La campanita es privada de cada artista.
router.use(requireAuth);

router.get('/', list);
router.post('/read', markRead);

module.exports = router;
