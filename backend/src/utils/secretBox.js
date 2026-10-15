/**
 * Cifrado de secretos en reposo (AES-256-GCM).
 *
 * Lo usa el WhatsApp vinculado: las credenciales de una sesión de WhatsApp
 * equivalen a acceso a la cuenta de su dueño, así que no se guardan en claro en la
 * base. Si la base se filtra, sin `WHATSAPP_AUTH_KEY` (que vive solo en las variables
 * de entorno del servidor) son bytes inservibles.
 *
 * GCM además autentica: un valor alterado en la base no se descifra en silencio, falla.
 *
 * Formato: `v1.<iv>.<etiqueta>.<cifrado>` (base64).
 */
const crypto = require('crypto');

const VERSION = 'v1';
// Una clave corta se adivina; este mínimo obliga a usar algo largo y aleatorio.
const MIN_KEY_LENGTH = 32;

class SecretBoxError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SecretBoxError';
  }
}

/** ¿Hay una clave de cifrado usable? */
const hasKey = (env = process.env) => (env.WHATSAPP_AUTH_KEY ?? '').trim().length >= MIN_KEY_LENGTH;

function keyFrom(env) {
  const raw = (env.WHATSAPP_AUTH_KEY ?? '').trim();
  if (raw.length < MIN_KEY_LENGTH) {
    throw new SecretBoxError(
      `Falta WHATSAPP_AUTH_KEY (mínimo ${MIN_KEY_LENGTH} caracteres): sin ella no se pueden guardar las credenciales de WhatsApp.`
    );
  }
  // SHA-256 deja la clave en los 32 bytes exactos que pide AES-256.
  return crypto.createHash('sha256').update(raw).digest();
}

function encrypt(plain, env = process.env) {
  const key = keyFrom(env);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return [VERSION, iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join('.');
}

function decrypt(token, env = process.env) {
  const [version, iv, tag, data] = String(token).split('.');
  if (version !== VERSION || !iv || !tag || data === undefined) {
    throw new SecretBoxError('El valor guardado no tiene el formato esperado.');
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyFrom(env), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  try {
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    // Clave equivocada o dato alterado: GCM no distingue, y no hace falta.
    throw new SecretBoxError('No se pudo descifrar: la clave cambió o el dato fue alterado.');
  }
}

module.exports = { encrypt, decrypt, hasKey, SecretBoxError, MIN_KEY_LENGTH };
