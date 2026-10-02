const express = require('express');
const { requireAuth } = require('../middleware/auth');
const controller = require('../controllers/quoteController');

const router = express.Router();

// Cotizaciones de insumos (HU14–HU16). Todo exige sesión y todo filtra por el
// usuario del token.
router.use(requireAuth);

// Cálculo sin guardar: lo que usa la calculadora en vivo.
router.post('/estimate', controller.estimate);

router.get('/', controller.list);
router.post('/', controller.create);
router.get('/:id', controller.get);
router.patch('/:id', controller.update);
router.delete('/:id', controller.remove);

// Descuento de stock (HU16).
router.post('/:id/consume', controller.consume);

module.exports = router;
