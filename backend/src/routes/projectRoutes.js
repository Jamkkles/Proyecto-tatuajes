const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { list, get, create, update, remove } = require('../controllers/projectController');

const router = express.Router();

router.use(requireAuth);

router.get('/', list);
router.post('/', create);
router.get('/:id', get);
router.patch('/:id', update);
router.delete('/:id', remove);

module.exports = router;
