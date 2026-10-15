const notificationModel = require('../models/notificationModel');
const pushService = require('./pushService');

/**
 * Avisa al artista: lo deja en la campanita y, si aceptó recibir push, también
 * se lo manda al dispositivo.
 *
 * Con `dedupeKey` repetido no hace nada (devuelve null), y tampoco manda el push:
 * lo que ya se avisó no se avisa dos veces.
 *
 * `push: false` es para los avisos meramente informativos («recordatorio
 * enviado»), que valen la campanita pero no merecen interrumpir al artista.
 *
 * Nunca lanza: un fallo avisando no puede romper la acción que lo originó
 * (cancelar una cita, descontar stock…).
 */
async function notify(userId, notification, { push = true } = {}) {
  let row;
  try {
    row = await notificationModel.create({ userId, ...notification });
  } catch (err) {
    console.error('No se pudo guardar el aviso:', err.message);
    return null;
  }
  if (!row || !push) return row;

  try {
    await pushService.sendToUser(userId, {
      id: row.id,
      title: row.title,
      body: row.body,
      url: row.url || '/dashboard',
      tag: row.kind,
    });
  } catch (err) {
    console.error('No se pudo enviar el push:', err.message);
  }
  return row;
}

module.exports = { notify };
