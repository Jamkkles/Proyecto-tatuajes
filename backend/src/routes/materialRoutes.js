const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { starterKit } = require('../middleware/starterKit');
const {
  list,
  create,
  loadDefaults,
  update,
  adjustStock,
  remove,
  removeAll,
} = require('../controllers/materialController');

const router = express.Router();

// El inventario es privado de cada artista.
router.use(requireAuth, starterKit);

router.get('/', list);
router.post('/', create);
router.post('/defaults', loadDefaults);
router.delete('/', removeAll);
router.patch('/:id', update);
router.post('/:id/stock', adjustStock);
router.delete('/:id', remove);

module.exports = router;
