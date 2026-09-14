const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { list, get, create, update, remove } = require('../controllers/clientController');

const router = express.Router();

// La cartera de clientes es privada de cada artista.
router.use(requireAuth);

router.get('/', list);
router.post('/', create);
router.get('/:id', get);
router.patch('/:id', update);
router.delete('/:id', remove);

module.exports = router;
