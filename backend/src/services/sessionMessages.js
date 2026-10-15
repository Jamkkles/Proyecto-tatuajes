const sessionModel = require('../models/sessionModel');
const notificationSettingsModel = require('../models/notificationSettingsModel');
const { deliver } = require('./clientMessages');
const { epochSeconds } = require('../utils/chileTime');

const time = (value) => new Date(value).getTime();

/**
 * Qué mensaje le toca al cliente tras un cambio en la sesión, si alguno.
 *
 *   cancelar una cita que iba a ocurrir     → cancelacion     (HU23)
 *   cambiar la hora de una cita pendiente   → reagendamiento  (HU23)
 *   dar la sesión por terminada             → cuidados        (HU28)
 *
 * Cancelar o mover una cita que ya pasó no se avisa: no tiene sentido escribirle
 * a alguien sobre algo que ya ocurrió.
 */
function decideKind(before, after, now = new Date()) {
  const future = time(after.starts_at) > now.getTime();

  if (before.status === 'agendada' && after.status === 'cancelada' && future) return 'cancelacion';
  if (
    before.status === 'agendada' &&
    after.status === 'agendada' &&
    time(before.starts_at) !== time(after.starts_at) &&
    future
  ) {
    return 'reagendamiento';
  }
  if (before.status !== 'completada' && after.status === 'completada') return 'cuidados';
  return null;
}

/** Cada mensaje se puede apagar por separado en la configuración del artista. */
const ENABLED = {
  cancelacion: (s) => s.changeNoticeEnabled,
  reagendamiento: (s) => s.changeNoticeEnabled,
  cuidados: (s) => s.aftercareEnabled,
};

const dedupeKeyFor = (kind, after) =>
  kind === 'reagendamiento'
    ? `reagendamiento:${after.id}:${epochSeconds(after.starts_at)}`
    : `${kind}:${after.id}:${epochSeconds(after.updated_at ?? after.starts_at)}`;

/**
 * Avisa al cliente después de actualizar una sesión.
 *
 * Nunca lanza: la cita ya quedó guardada y no se puede perder esa actualización
 * por un problema con el aviso. Devuelve qué pasó, para que la pantalla lo cuente
 * (`{ kind, channel, status, waLink? }`), o null si no tocaba avisar.
 */
async function afterUpdate({ userId, before, after }, { now = new Date(), env = process.env } = {}) {
  try {
    const kind = decideKind(before, after, now);
    if (!kind) return null;

    const settings = await notificationSettingsModel.get(userId);
    if (!ENABLED[kind](settings)) return null;

    const context = await sessionModel.findWithClient(after.id, userId);
    if (!context) return null;

    const result = await deliver(
      {
        kind,
        userId,
        sessionId: after.id,
        client: { id: context.client_id, name: context.client_name, phone: context.client_phone },
        artistName: context.artist_name,
        startsAt: after.starts_at,
        note: settings.aftercareNote,
        dedupeKey: dedupeKeyFor(kind, after),
      },
      { env }
    );
    if (result.status === 'duplicado') return null;
    return { kind, channel: result.channel, status: result.status, waLink: result.waLink ?? null };
  } catch (err) {
    console.error('No se pudo avisar al cliente del cambio en la sesión:', err.message);
    return null;
  }
}

/**
 * Lo que el artista pide a mano desde la pantalla (botón «Recordar por
 * WhatsApp»): sin deduplicar, porque es una orden explícita, y sin aviso en la
 * campanita, porque el resultado se le muestra ahí mismo.
 */
async function sendNow({ userId, sessionId, kind }, { env = process.env } = {}) {
  const context = await sessionModel.findWithClient(sessionId, userId);
  if (!context) return null;

  const settings = await notificationSettingsModel.get(userId);
  return deliver(
    {
      kind,
      userId,
      sessionId,
      client: { id: context.client_id, name: context.client_name, phone: context.client_phone },
      artistName: context.artist_name,
      startsAt: context.starts_at,
      note: kind === 'cuidados' ? settings.aftercareNote : settings.reminderNote,
      dedupeKey: `manual:${kind}:${sessionId}:${Date.now()}`,
      silent: true,
    },
    { env }
  );
}

module.exports = { decideKind, afterUpdate, sendNow };
