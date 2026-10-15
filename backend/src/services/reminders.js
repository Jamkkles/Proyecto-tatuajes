const reminderModel = require('../models/reminderModel');
const { deliver } = require('./clientMessages');
const { epochSeconds } = require('../utils/chileTime');

/**
 * Manda los recordatorios que toquen ahora (HU22). Es idempotente: se puede
 * llamar cada pocos minutos, desde el programador interno, desde un servicio
 * externo o a mano, y cada cita recibe su recordatorio una sola vez.
 *
 * @returns {{ checked, whatsapp, manual, omitted, duplicates, errors }}
 */
async function runReminders({ now = new Date(), env = process.env } = {}) {
  // Con el WhatsApp vinculado cada envío lleva una pausa de varios segundos, así que una
  // corrida puede durar minutos. Si llega otra mientras tanto (el programador interno y el
  // externo coinciden), se une a la que está en curso en vez de empezar otra encima.
  if (inFlight) return inFlight;
  inFlight = run({ now, env }).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

let inFlight = null;

async function run({ now, env }) {
  const due = await reminderModel.dueForReminder(now);
  const summary = { checked: due.length, whatsapp: 0, manual: 0, omitted: 0, duplicates: 0, errors: 0 };

  // De a uno: son pocos y así un fallo no arrastra a los demás ni se supera el
  // límite de la API de WhatsApp.
  for (const session of due) {
    try {
      const result = await deliver(
        {
          kind: 'recordatorio',
          userId: session.user_id,
          sessionId: session.id,
          client: { id: session.client_id, name: session.client_name, phone: session.client_phone },
          artistName: session.artist_name,
          startsAt: session.starts_at,
          note: session.reminder_note,
          dedupeKey: `recordatorio:${session.id}:${epochSeconds(session.starts_at)}`,
        },
        { env }
      );
      if (result.status === 'duplicado') summary.duplicates += 1;
      else if (result.status === 'omitido') summary.omitted += 1;
      else if (result.channel === 'whatsapp') summary.whatsapp += 1;
      else summary.manual += 1;
    } catch (err) {
      summary.errors += 1;
      console.error(`Error enviando el recordatorio de la sesión ${session.id}:`, err.message);
    }
  }
  return summary;
}

module.exports = { runReminders };
