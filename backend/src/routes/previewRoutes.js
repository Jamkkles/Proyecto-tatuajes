const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { list, get, create, update, remove } = require('../controllers/previewController');

const router = express.Router();

// Cada artista solo ve y modifica sus propias previsualizaciones.
router.use(requireAuth);

router.get('/', list);
router.get('/:id', get);
router.post('/', create);
router.patch('/:id', update);
router.delete('/:id', remove);

module.exports = router;
