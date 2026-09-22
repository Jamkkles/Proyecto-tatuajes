const express = require('express');
const { requireAuth } = require('../middleware/auth');
const {
  list,
  create,
  update,
  adjustStock,
  remove,
} = require('../controllers/materialController');

const router = express.Router();

// El inventario es privado de cada artista.
router.use(requireAuth);

router.get('/', list);
router.post('/', create);
router.patch('/:id', update);
router.post('/:id/stock', adjustStock);
router.delete('/:id', remove);

module.exports = router;
