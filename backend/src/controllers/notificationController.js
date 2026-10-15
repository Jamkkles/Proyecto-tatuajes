const notificationModel = require('../models/notificationModel');
const { isUuid, sendError } = require('../utils/fields');

const MAX_LIMIT = 100;

// GET /api/notifications?limit=  → la lista de la campanita y cuántas faltan por leer
async function list(req, res) {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), MAX_LIMIT);
  try {
    return res.json(await notificationModel.listByUser(req.user.sub, { limit }));
  } catch (err) {
    return sendError(res, err, 'listando los avisos');
  }
}

// POST /api/notifications/read  { ids: [...] } | { all: true }
async function markRead(req, res) {
  const { ids, all } = req.body ?? {};
  if (all !== true && !(Array.isArray(ids) && ids.length > 0 && ids.every(isUuid))) {
    return res.status(400).json({ message: 'Indica qué avisos marcar como leídos.' });
  }
  if (Array.isArray(ids) && ids.length > MAX_LIMIT) {
    return res.status(400).json({ message: 'Son demasiados avisos de una vez.' });
  }

  try {
    const updated = await notificationModel.markRead(req.user.sub, { ids, all: all === true });
    return res.json({ updated });
  } catch (err) {
    return sendError(res, err, 'marcando los avisos');
  }
}

module.exports = { list, markRead };
