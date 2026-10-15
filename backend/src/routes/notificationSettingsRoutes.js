const express = require('express');
const { requireAuth } = require('../middleware/auth');
const controller = require('../controllers/notificationSettingsController');

const router = express.Router();

router.use(requireAuth);

router.get('/', controller.get);
router.put('/', controller.save);

module.exports = router;
