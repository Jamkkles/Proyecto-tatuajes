const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { imageUpload } = require('../middleware/imageUpload');
const {
  list,
  income,
  create,
  update,
  remove,
  addPhoto,
  removePhoto,
  sendMessage,
} = require('../controllers/sessionController');

const router = express.Router();

router.use(requireAuth);

router.get('/', list);
router.get('/income', income);
router.post('/', create);
router.patch('/:id', update);
router.delete('/:id', remove);

// El artista pide a mano el mensaje al cliente (recordatorio o cuidados).
router.post('/:id/message', sendMessage);

// Fotos del avance del tatuaje en cada sesión.
router.post('/:id/photos', imageUpload, addPhoto);
router.delete('/:id/photos/:photoId', removePhoto);

module.exports = router;
