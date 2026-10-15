const express = require('express');
const { requireAuth } = require('../middleware/auth');
const controller = require('../controllers/pushController');

const router = express.Router();

router.use(requireAuth);

router.get('/config', controller.config);
router.post('/subscribe', controller.subscribe);
router.post('/unsubscribe', controller.unsubscribe);
router.post('/test', controller.test);

module.exports = router;
