/**
 * Notificaciones push al celular o al navegador (Web Push, estándar VAPID).
 *
 * No hay servicio de pago de por medio: el navegador entrega un `endpoint` propio
 * de cada dispositivo (en Chrome lo atiende Google, en Safari Apple) y el servidor
 * le habla directo con la clave VAPID.
 *
 * En iPhone solo funciona con la app instalada en la pantalla de inicio (iOS 16.4
 * o más); dentro de una pestaña de Safari el navegador no ofrece push.
 */
const webpush = require('web-push');
const pushSubscriptionModel = require('../models/pushSubscriptionModel');

function config(env = process.env) {
  const publicKey = env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return null;
  // El estándar exige un contacto (mailto: o https:) para que el servicio de push
  // pueda avisar si algo anda mal. Con un FRONTEND_URL https sirve ese.
  const frontend = env.FRONTEND_URL?.startsWith('https://') ? env.FRONTEND_URL : null;
  return {
    publicKey,
    privateKey,
    subject: env.VAPID_SUBJECT?.trim() || frontend || 'mailto:no-reply@example.com',
  };
}

const isConfigured = (env = process.env) => config(env) !== null;
const publicKey = (env = process.env) => config(env)?.publicKey ?? null;

/**
 * Envía el aviso a todos los dispositivos del artista. Los que el servicio de
 * push da por muertos (404/410: se desinstaló la app o se revocó el permiso) se
 * borran, para no seguir intentando.
 *
 * @returns {{ sent: number, removed: number, skipped?: boolean }}
 */
async function sendToUser(userId, payload, { env = process.env, sender = webpush } = {}) {
  const cfg = config(env);
  if (!cfg) return { sent: 0, removed: 0, skipped: true };

  const subscriptions = await pushSubscriptionModel.listByUser(userId);
  const body = JSON.stringify(payload);
  const options = {
    vapidDetails: { subject: cfg.subject, publicKey: cfg.publicKey, privateKey: cfg.privateKey },
    TTL: 24 * 60 * 60,
    timeout: 8000,
  };

  let sent = 0;
  let removed = 0;
  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await sender.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
          options
        );
        sent += 1;
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await pushSubscriptionModel.removeById(sub.id);
          removed += 1;
        } else {
          console.error('No se pudo enviar el push:', err.statusCode ?? '', err.message);
        }
      }
    })
  );
  return { sent, removed };
}

module.exports = { config, isConfigured, publicKey, sendToUser };
