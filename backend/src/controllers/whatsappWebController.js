const whatsappWeb = require('../services/whatsappWeb');
const { normalizePhone } = require('../utils/phone');
const { sendError } = require('../utils/fields');

/** Errores esperables de la vinculación: se le explican al artista, no son un 500. */
const USER_FACING = {
  desactivado: 503,
  sin_libreria: 503,
  ya_vinculado: 409,
  no_vinculado: 409,
  sin_codigo: 502,
  sin_conexion: 502,
  desvinculado: 409,
  sin_cupo: 503,
};

function fail(res, err, action) {
  if (err instanceof whatsappWeb.WhatsAppWebError && err.code in USER_FACING) {
    return res.status(USER_FACING[err.code]).json({ message: err.message, code: err.code });
  }
  return sendError(res, err, action);
}

// GET /api/whatsapp-web  → estado de la vinculación del artista
async function status(req, res) {
  try {
    return res.json(await whatsappWeb.getStatus(req.user.sub));
  } catch (err) {
    return fail(res, err, 'leyendo el estado de WhatsApp');
  }
}

// POST /api/whatsapp-web/link  { phone, acceptRisk: true }  → { pairingCode }
async function link(req, res) {
  // El artista acepta el riesgo de forma explícita, y el servidor lo exige: no basta con
  // que lo haga la pantalla. Este uso va contra los términos de WhatsApp.
  if (req.body?.acceptRisk !== true) {
    return res.status(400).json({
      message: 'Para vincular tu WhatsApp tienes que aceptar el riesgo de que WhatsApp bloquee el número.',
    });
  }
  const phone = normalizePhone(req.body?.phone);
  if (!phone) {
    return res.status(400).json({
      message: 'Escribe tu número de WhatsApp completo, por ejemplo +56 9 1234 5678.',
    });
  }

  try {
    const { pairingCode } = await whatsappWeb.startLinking(req.user.sub, phone);
    return res.status(201).json({ pairingCode });
  } catch (err) {
    return fail(res, err, 'vinculando WhatsApp');
  }
}

// POST /api/whatsapp-web/test  → un mensaje al propio número del artista
async function test(req, res) {
  try {
    await whatsappWeb.sendTest(req.user.sub);
    return res.json({ ok: true });
  } catch (err) {
    return fail(res, err, 'probando WhatsApp');
  }
}

// POST /api/whatsapp-web/unlink
async function unlink(req, res) {
  try {
    await whatsappWeb.unlink(req.user.sub);
    return res.status(204).end();
  } catch (err) {
    return fail(res, err, 'desvinculando WhatsApp');
  }
}

module.exports = { status, link, test, unlink };
