/**
 * Mensajes al CLIENTE sobre su cita: recordatorio, cancelación, cambio de hora y
 * cuidados posteriores (HU22, HU23, HU28).
 *
 * Cada mensaje existe en dos formas: los parámetros de su plantilla de WhatsApp
 * (para mandarlo la API) y el texto equivalente (para el enlace de WhatsApp que se
 * le deja al artista cuando no hay API). Las dos salen de las mismas frases para
 * que el cliente reciba lo mismo por cualquiera de las dos vías.
 */
const { normalizePhone, waLink } = require('../utils/phone');
const { dateLabel, timeLabel } = require('../utils/chileTime');
const whatsapp = require('./whatsapp');
const messageLogModel = require('../models/messageLogModel');
const { notify } = require('./notifier');

/**
 * Las plantillas hay que crearlas y hacer aprobar en el administrador de WhatsApp
 * (ver docs/whatsapp-y-notificaciones.md); el texto de cada una está ahí. Los
 * nombres se pueden cambiar por variable de entorno.
 *
 * Meta no deja empezar ni terminar una plantilla con una variable, por eso todas
 * cierran con texto fijo.
 */
const KINDS = {
  recordatorio: {
    template: (env) => env.WHATSAPP_TEMPLATE_RECORDATORIO || 'recordatorio_cita',
    // {{1}} cliente · {{2}} artista · {{3}} día · {{4}} hora · {{5}} nota del artista
    params: (c) => [c.clientName, c.artistName, dateLabel(c.startsAt), timeLabel(c.startsAt), c.note],
    text: (c) =>
      `Hola ${c.clientName}, te recordamos tu cita con ${c.artistName} el ` +
      `${dateLabel(c.startsAt)} a las ${timeLabel(c.startsAt)}. ${c.note} ¡Te esperamos!`,
    title: (c) => `Recuerda a ${c.clientName} su cita`,
    detail: (c) => `${dateLabel(c.startsAt)} a las ${timeLabel(c.startsAt)}`,
    action: 'enviarle el recordatorio',
    sentTitle: (c) => `Recordatorio enviado a ${c.clientName}`,
  },
  cancelacion: {
    template: (env) => env.WHATSAPP_TEMPLATE_CANCELACION || 'cita_cancelada',
    // {{1}} cliente · {{2}} artista · {{3}} día y hora de la cita cancelada
    params: (c) => [
      c.clientName,
      c.artistName,
      `${dateLabel(c.startsAt)} a las ${timeLabel(c.startsAt)}`,
    ],
    text: (c) =>
      `Hola ${c.clientName}, ${c.artistName} tuvo que cancelar tu cita del ` +
      `${dateLabel(c.startsAt)} a las ${timeLabel(c.startsAt)}. ` +
      'Escríbenos para coordinar una nueva fecha.',
    title: (c) => `Avisa a ${c.clientName} que cancelaste su cita`,
    detail: (c) => `Era el ${dateLabel(c.startsAt)} a las ${timeLabel(c.startsAt)}`,
    action: 'avisarle',
    sentTitle: (c) => `Cancelación avisada a ${c.clientName}`,
  },
  reagendamiento: {
    template: (env) => env.WHATSAPP_TEMPLATE_REAGENDAMIENTO || 'cita_reagendada',
    // {{1}} cliente · {{2}} artista · {{3}} día nuevo · {{4}} hora nueva
    params: (c) => [c.clientName, c.artistName, dateLabel(c.startsAt), timeLabel(c.startsAt)],
    text: (c) =>
      `Hola ${c.clientName}, ${c.artistName} cambió tu cita. Tu nueva hora es el ` +
      `${dateLabel(c.startsAt)} a las ${timeLabel(c.startsAt)}. ` +
      'Si no te acomoda, responde a este mensaje.',
    title: (c) => `Avisa a ${c.clientName} del cambio de hora`,
    detail: (c) => `Nueva hora: ${dateLabel(c.startsAt)} a las ${timeLabel(c.startsAt)}`,
    action: 'avisarle',
    sentTitle: (c) => `Cambio de hora avisado a ${c.clientName}`,
  },
  cuidados: {
    template: (env) => env.WHATSAPP_TEMPLATE_CUIDADOS || 'cuidados_tatuaje',
    // {{1}} cliente · {{2}} artista · {{3}} texto de cuidados del artista
    params: (c) => [c.clientName, c.artistName, c.note],
    text: (c) =>
      `Hola ${c.clientName}, gracias por tu sesión con ${c.artistName}. ` +
      `Cuidados de tu tatuaje: ${c.note} Cualquier duda, escríbenos.`,
    title: (c) => `Envía a ${c.clientName} los cuidados de su tatuaje`,
    detail: () => 'Sesión terminada',
    action: 'enviarle los cuidados',
    sentTitle: (c) => `Cuidados enviados a ${c.clientName}`,
  },
};

const KIND_NAMES = Object.keys(KINDS);

/** Solo el primer nombre: «Hola Ana» y no «Hola Ana María Pérez Soto». */
const firstName = (full) => String(full ?? '').trim().split(/\s+/)[0] || 'cliente';

/**
 * Entrega un mensaje al cliente por el mejor canal que haya y deja constancia.
 *
 *   1. Reclama el envío (message_log); si ya estaba reclamado, no hace nada.
 *   2. Sin teléfono válido: lo registra y avisa al artista que lo corrija.
 *   3. Con API de WhatsApp: lo manda. Si falla, cae al camino manual.
 *   4. Sin API (o si falló): deja al artista el enlace de WhatsApp con el mensaje
 *      escrito, para que lo envíe él con un toque.
 *
 * `silent` es para cuando el artista lo pide desde la pantalla (ya ve el resultado
 * en ella, no necesita además una notificación).
 *
 * @returns {{ status, channel, waLink?, text?, reason?, error? }}
 */
async function deliver(
  { kind, userId, sessionId, client, artistName, startsAt, note = '', dedupeKey, silent = false },
  { env = process.env } = {}
) {
  const def = KINDS[kind];
  if (!def) throw new Error(`Tipo de mensaje desconocido: ${kind}`);

  const phone = normalizePhone(client.phone);
  const context = {
    clientName: firstName(client.name),
    artistName: firstName(artistName),
    startsAt: new Date(startsAt),
    note,
  };
  const text = def.text(context);
  const auto = whatsapp.isConfigured(env) && phone !== null;

  const claimed = await messageLogModel.claim({
    userId,
    sessionId,
    kind,
    channel: auto ? 'whatsapp' : 'manual',
    toPhone: phone,
    dedupeKey,
  });
  if (!claimed) return { status: 'duplicado', channel: 'ninguno' };

  const base = { kind, sessionId, clientId: client.id };

  // Sin teléfono utilizable no hay a quién escribirle por ningún canal.
  if (!phone) {
    await messageLogModel.finish(claimed.id, {
      status: 'omitido',
      channel: 'manual',
      error: 'El cliente no tiene un teléfono válido.',
    });
    if (!silent) {
      await notify(userId, {
        kind: 'mensaje_omitido',
        title: `No pudimos avisar a ${context.clientName}`,
        body: 'Su teléfono falta o no es un celular válido. Corrígelo en su ficha para poder escribirle.',
        url: client.id ? `/clientes/${client.id}` : '/clientes',
        data: base,
      });
    }
    return { status: 'omitido', channel: 'manual', reason: 'sin_telefono', text };
  }

  let failure = null;
  if (auto) {
    try {
      const { id } = await whatsapp.sendTemplate(
        { to: phone, template: def.template(env), params: def.params(context) },
        { env }
      );
      await messageLogModel.finish(claimed.id, { status: 'enviado', channel: 'whatsapp', providerId: id });
      if (!silent) {
        await notify(
          userId,
          {
            kind: 'mensaje_enviado',
            title: def.sentTitle(context),
            body: def.detail(context),
            url: '/citas',
            data: base,
          },
          { push: false }
        );
      }
      return { status: 'enviado', channel: 'whatsapp', text };
    } catch (err) {
      failure = err.message;
      console.error(`Falló el envío de WhatsApp (${kind}):`, err.message);
    }
  }

  // Camino manual: gratis y siempre disponible.
  const link = waLink(phone, text);
  await messageLogModel.finish(claimed.id, {
    status: failure ? 'error' : 'pendiente',
    channel: 'manual',
    error: failure,
  });
  if (!silent) {
    await notify(userId, {
      kind: 'mensaje_manual',
      title: def.title(context),
      body: `${def.detail(context)}. Toca para ${def.action} por WhatsApp.`,
      url: '/citas',
      data: { ...base, waLink: link },
    });
  }
  return { status: failure ? 'error' : 'pendiente', channel: 'manual', waLink: link, text, error: failure };
}

module.exports = { KINDS, KIND_NAMES, deliver, firstName };
