const crypto = require('crypto');
const { runReminders } = require('../services/reminders');
const { sendError } = require('../utils/fields');

/** Compara sin filtrar por tiempo cuántos caracteres acertó quien adivina. */
function secretMatches(given, expected) {
  const a = Buffer.from(String(given ?? ''));
  const b = Buffer.from(String(expected));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Cuánto se espera a que termine antes de responder «sigue en curso».
const WAIT_MS = 20_000;
const TIMED_OUT = Symbol('timed-out');
const wait = (ms) => new Promise((resolve) => setTimeout(() => resolve(TIMED_OUT), ms).unref?.());

/**
 * POST /api/jobs/reminders
 *
 * Lo llama el programador externo cada pocos minutos. No lleva sesión de usuario
 * sino una clave compartida (`CRON_SECRET`) en la cabecera `X-Cron-Secret`. Sin la
 * variable definida el endpoint no existe (404): así no queda una puerta abierta
 * por olvido de configuración.
 *
 * De paso despierta al servidor gratuito, que se duerme tras 15 minutos sin uso:
 * llamarlo cada 10 minutos lo mantiene despierto para que los recordatorios
 * salgan a tiempo.
 */
async function reminders(req, res) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return res.status(404).json({ message: 'No encontrado.' });
  if (!secretMatches(req.get('x-cron-secret'), expected)) {
    return res.status(401).json({ message: 'No autorizado.' });
  }

  try {
    // El programador externo corta a los 30 segundos y, tras varios fallos seguidos, puede
    // dar el trabajo por roto. Con el WhatsApp vinculado una corrida con varios mensajes
    // tarda más que eso (cada envío lleva pausa), así que se espera un rato razonable y, si
    // no termina, se responde que sigue en curso: el trabajo continúa en el servidor.
    const run = runReminders();
    const outcome = await Promise.race([run, wait(WAIT_MS)]);
    if (outcome === TIMED_OUT) {
      run.catch((err) => console.error('Falló la corrida de recordatorios:', err.message));
      return res.status(202).json({ status: 'en_curso' });
    }
    return res.json(outcome);
  } catch (err) {
    return sendError(res, err, 'enviando los recordatorios');
  }
}

module.exports = { reminders };
