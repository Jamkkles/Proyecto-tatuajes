const express = require('express');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const {
  listStudios,
  createStudio,
  updateStudio,
  addTattooist,
  updateUser,
  resetPassword,
} = require('../controllers/adminController');

const router = express.Router();

// Solo el administrador de la plataforma (HU31–HU36, HU38).
router.use(requireAuth, requireAdmin);

router.get('/studios', listStudios);
router.post('/studios', createStudio);
router.patch('/studios/:id', updateStudio);
router.post('/studios/:id/tattooists', addTattooist);
router.patch('/users/:id', updateUser);
router.post('/users/:id/reset-password', resetPassword);

module.exports = router;
