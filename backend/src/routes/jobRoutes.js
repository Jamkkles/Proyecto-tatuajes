const express = require('express');
const { reminders } = require('../controllers/jobController');

const router = express.Router();

// Sin requireAuth a propósito: lo llama un programador externo con una clave
// compartida, no un artista con sesión (ver jobController).
router.post('/reminders', reminders);

module.exports = router;
