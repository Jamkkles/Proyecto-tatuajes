const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { mine, summary } = require('../controllers/studioController');

const router = express.Router();

// «Mi estudio»: el dueño ve cuánto entró por tatuador; nadie más.
router.use(requireAuth);

router.get('/', mine);
router.get('/summary', summary);

module.exports = router;
