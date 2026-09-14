const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { imageUpload } = require('../middleware/imageUpload');
const {
  list,
  create,
  update,
  remove,
  addPhoto,
  removePhoto,
} = require('../controllers/sessionController');

const router = express.Router();

router.use(requireAuth);

router.get('/', list);
router.post('/', create);
router.patch('/:id', update);
router.delete('/:id', remove);

// Fotos del avance del tatuaje en cada sesión.
router.post('/:id/photos', imageUpload, addPhoto);
router.delete('/:id/photos/:photoId', removePhoto);

module.exports = router;
