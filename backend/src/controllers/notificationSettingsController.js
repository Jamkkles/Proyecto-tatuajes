const notificationSettingsModel = require('../models/notificationSettingsModel');
const whatsapp = require('../services/whatsapp');
const pushService = require('../services/pushService');
const whatsappWeb = require('../services/whatsappWeb');
const { FieldError, boolean, sendError } = require('../utils/fields');

const MAX_REMINDER_NOTE = 300;
const MAX_AFTERCARE_NOTE = 600;

/**
 * Un texto de una sola línea. Se juntan los saltos de línea y los espacios
 * repetidos en uno solo en vez de rechazarlos: la API de WhatsApp no admite saltos
 * de línea dentro de los parámetros de una plantilla, y al artista que pegó un
 * párrafo no le sirve un error, le sirve que simplemente funcione.
 */
function singleLine(raw, label, max) {
  if (raw === undefined) return undefined;
  const text = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (!text) throw new FieldError(`${label} no puede quedar vacío.`);
  if (text.length > max) throw new FieldError(`${label} no puede superar ${max} caracteres.`);
  return text;
}

/**
 * Qué canales hay para este artista, para que la pantalla lo explique:
 *   automatico  la API oficial de WhatsApp (de pago): los mensajes salen solos
 *   vinculado   su propio WhatsApp vinculado (gratis, no oficial): salen solos desde su número
 *   manual      se le deja un enlace para que los envíe él
 * `whatsappWeb` dice si el servidor ofrece vincular el propio WhatsApp.
 */
async function channels(userId) {
  const linked = !whatsapp.isConfigured() && (await whatsappWeb.isReady(userId).catch(() => false));
  return {
    whatsapp: whatsapp.isConfigured() ? 'automatico' : linked ? 'vinculado' : 'manual',
    push: pushService.isConfigured(),
    whatsappWeb: whatsappWeb.settings().enabled,
  };
}

// GET /api/notification-settings
async function get(req, res) {
  try {
    const settings = await notificationSettingsModel.get(req.user.sub);
    return res.json({ settings, channels: await channels(req.user.sub) });
  } catch (err) {
    return sendError(res, err, 'leyendo la configuración de avisos');
  }
}

// PUT /api/notification-settings  → guarda solo los campos que vienen
async function save(req, res) {
  const body = req.body ?? {};
  try {
    const fields = {
      remindersEnabled: boolean(body.remindersEnabled, 'El recordatorio debe ser verdadero o falso.'),
      changeNoticeEnabled: boolean(body.changeNoticeEnabled, 'El aviso de cambios debe ser verdadero o falso.'),
      aftercareEnabled: boolean(body.aftercareEnabled, 'El aviso de cuidados debe ser verdadero o falso.'),
      reminderNote: singleLine(body.reminderNote, 'El texto del recordatorio', MAX_REMINDER_NOTE),
      aftercareNote: singleLine(body.aftercareNote, 'El texto de cuidados', MAX_AFTERCARE_NOTE),
    };
    const settings = await notificationSettingsModel.save(req.user.sub, fields);
    return res.json({ settings, channels: await channels(req.user.sub) });
  } catch (err) {
    return sendError(res, err, 'guardando la configuración de avisos');
  }
}

module.exports = { get, save };
