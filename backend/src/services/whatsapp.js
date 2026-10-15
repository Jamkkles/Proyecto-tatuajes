/**
 * Cliente de la API de WhatsApp Business (Cloud API de Meta).
 *
 * Se manda por **plantillas aprobadas** y no con texto libre: un recordatorio
 * un día antes cae siempre fuera de la ventana de 24 horas en que WhatsApp deja
 * escribir libremente, y fuera de ella solo valen las plantillas. Por eso los
 * mensajes (`clientMessages.js`) se arman como una lista de parámetros que
 * rellenan los {{1}}, {{2}}… de cada plantilla.
 *
 * **Cuesta dinero.** Meta cobra por mensaje de plantilla entregado fuera de la
 * ventana de conversación. Mientras no haya credenciales (`isConfigured()` es
 * falso) nada de esto se usa y la app deja el aviso al artista con un enlace para
 * enviarlo él mismo, que es gratis.
 */
const DEFAULT_VERSION = 'v25.0';

class WhatsAppError extends Error {
  constructor(message, { status = null, code = null } = {}) {
    super(message);
    this.name = 'WhatsAppError';
    this.status = status;
    this.code = code;
  }
}

function config(env = process.env) {
  const token = env.WHATSAPP_TOKEN?.trim();
  const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  if (!token || !phoneNumberId) return null;
  return {
    token,
    phoneNumberId,
    version: env.WHATSAPP_API_VERSION?.trim() || DEFAULT_VERSION,
    language: env.WHATSAPP_LANG?.trim() || 'es',
  };
}

const isConfigured = (env = process.env) => config(env) !== null;

/**
 * Deja un parámetro como lo acepta Meta: una sola línea y sin espacios
 * repetidos (rechaza saltos de línea, tabulaciones y cuatro espacios seguidos), y
 * nunca vacío (rechaza los parámetros sin texto).
 */
function cleanParam(value, max = 900) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  return text || '-';
}

/**
 * Envía una plantilla.
 *
 * @param {object} message
 * @param {string} message.to        teléfono en dígitos con código de país
 * @param {string} message.template  nombre de la plantilla aprobada
 * @param {string[]} message.params  valores de {{1}}, {{2}}…
 * @returns {Promise<{ id: string }>} id que asigna WhatsApp al mensaje
 */
async function sendTemplate({ to, template, params }, { env = process.env, fetchImpl = fetch } = {}) {
  const cfg = config(env);
  if (!cfg) throw new WhatsAppError('WhatsApp no está configurado.');

  const body = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: template,
      language: { code: cfg.language },
      components: [
        {
          type: 'body',
          parameters: params.map((text) => ({ type: 'text', text: cleanParam(text) })),
        },
      ],
    },
  };

  let res;
  try {
    res = await fetchImpl(`https://graph.facebook.com/${cfg.version}/${cfg.phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    throw new WhatsAppError(`No se pudo contactar a WhatsApp: ${err.message}`);
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    // El mensaje de Meta es útil («template not found», «token expired»…) y no
    // lleva el token, que solo viaja en la cabecera.
    const detail = data?.error?.message || `HTTP ${res.status}`;
    throw new WhatsAppError(detail, { status: res.status, code: data?.error?.code ?? null });
  }

  const id = data?.messages?.[0]?.id;
  if (!id) throw new WhatsAppError('WhatsApp no devolvió el id del mensaje.');
  return { id };
}

module.exports = { isConfigured, config, sendTemplate, cleanParam, WhatsAppError, DEFAULT_VERSION };
