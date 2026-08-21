const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { list, create, update, remove, uploadMiddleware } = require('../controllers/sketchController');

const router = express.Router();

// Toda la galería es privada: cada artista solo ve y modifica sus bocetos.
router.use(requireAuth);

router.get('/', list);
router.post('/', uploadMiddleware, create);
router.patch('/:id', update);
router.delete('/:id', remove);

module.exports = router;
