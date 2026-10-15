const pushService = require('../services/pushService');
const pushSubscriptionModel = require('../models/pushSubscriptionModel');
const { FieldError, sendError } = require('../utils/fields');

// Lo que manda el navegador (PushSubscription.toJSON()): una URL https y dos claves
// en base64 url-safe. Se valida la forma para no guardar basura.
const KEY_RE = /^[A-Za-z0-9_-]{16,200}$/;

function parseSubscription(body) {
  const endpoint = body?.endpoint;
  const p256dh = body?.keys?.p256dh;
  const auth = body?.keys?.auth;
  if (typeof endpoint !== 'string' || !/^https:\/\//.test(endpoint) || endpoint.length > 2048) {
    throw new FieldError('La suscripción no es válida.');
  }
  if (!KEY_RE.test(p256dh ?? '') || !KEY_RE.test(auth ?? '')) {
    throw new FieldError('La suscripción no es válida.');
  }
  return { endpoint, p256dh, auth };
}

// GET /api/push/config  → { enabled, publicKey }
// La clave pública la pide el navegador para suscribirse; viaja por aquí y no
// compilada en el frontend para poder cambiarla sin volver a desplegarlo.
function config(req, res) {
  return res.json({ enabled: pushService.isConfigured(), publicKey: pushService.publicKey() });
}

// POST /api/push/subscribe  { endpoint, keys: { p256dh, auth } }
async function subscribe(req, res) {
  if (!pushService.isConfigured()) {
    return res.status(503).json({ message: 'Las notificaciones push no están activadas en el servidor.' });
  }
  try {
    const subscription = parseSubscription(req.body);
    await pushSubscriptionModel.save({
      userId: req.user.sub,
      ...subscription,
      userAgent: String(req.headers['user-agent'] ?? '').slice(0, 300) || null,
    });
    return res.status(201).json({ ok: true });
  } catch (err) {
    return sendError(res, err, 'guardando la suscripción push');
  }
}

// POST /api/push/unsubscribe  { endpoint }
async function unsubscribe(req, res) {
  const endpoint = req.body?.endpoint;
  if (typeof endpoint !== 'string' || !endpoint) {
    return res.status(400).json({ message: 'Indica qué dispositivo quitar.' });
  }
  try {
    await pushSubscriptionModel.removeByEndpoint(req.user.sub, endpoint);
    return res.status(204).end();
  } catch (err) {
    return sendError(res, err, 'quitando la suscripción push');
  }
}

// POST /api/push/test  → manda un aviso de prueba a los dispositivos del artista
async function test(req, res) {
  if (!pushService.isConfigured()) {
    return res.status(503).json({ message: 'Las notificaciones push no están activadas en el servidor.' });
  }
  try {
    const result = await pushService.sendToUser(req.user.sub, {
      title: 'Notificaciones activadas',
      body: 'Así te avisaremos de tus citas y de tu inventario.',
      url: '/dashboard',
      tag: 'prueba',
    });
    return res.json(result);
  } catch (err) {
    return sendError(res, err, 'enviando el push de prueba');
  }
}

module.exports = { config, subscribe, unsubscribe, test };
