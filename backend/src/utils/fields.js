// Validación de campos compartida por los controladores de la agenda
// (clientes, proyectos y sesiones).
//
// Cada helper devuelve el valor saneado o lanza FieldError con un mensaje listo
// para el usuario. Convención para campos opcionales en un PATCH:
//   undefined → el campo no vino, no se toca
//   null / '' → se borra (queda NULL)

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Tope de cordura para montos: 100 millones de pesos.
const MAX_AMOUNT = 100000000;

class FieldError extends Error {
  constructor(message) {
    super(message);
    this.name = 'FieldError';
    this.status = 400;
  }
}

const isUuid = (value) => typeof value === 'string' && UUID_RE.test(value);

function requiredText(raw, label, max) {
  const text = raw === undefined || raw === null ? '' : String(raw).trim();
  if (!text) throw new FieldError(`${label} es obligatorio.`);
  if (text.length > max) throw new FieldError(`${label} no puede superar ${max} caracteres.`);
  return text;
}

function optionalText(raw, label, max) {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  const text = String(raw).trim();
  if (text.length > max) throw new FieldError(`${label} no puede superar ${max} caracteres.`);
  return text || null;
}

/** Monto en pesos: entero, sin decimales, entre 0 y MAX_AMOUNT. */
function money(raw, label) {
  if (raw === undefined) return undefined;
  const n = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
  if (!Number.isInteger(n) || n < 0 || n > MAX_AMOUNT) {
    throw new FieldError(`${label} debe ser un monto en pesos, sin decimales.`);
  }
  return n;
}

function integerBetween(raw, min, max, message) {
  if (raw === undefined) return undefined;
  const n = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
  if (!Number.isInteger(n) || n < min || n > max) throw new FieldError(message);
  return n;
}

function oneOf(raw, allowed, message) {
  if (raw === undefined) return undefined;
  if (!allowed.includes(raw)) throw new FieldError(message);
  return raw;
}

function boolean(raw, message) {
  if (raw === undefined) return undefined;
  if (typeof raw !== 'boolean') throw new FieldError(message);
  return raw;
}

/** Referencia opcional a otra fila: '' o null la quitan. */
function optionalUuid(raw, message) {
  if (raw === undefined) return undefined;
  if (raw === null || raw === '') return null;
  if (!isUuid(raw)) throw new FieldError(message);
  return raw;
}

/** Fecha y hora ISO 8601 (con zona). Se normaliza a UTC. */
function dateTime(raw, message) {
  if (raw === undefined) return undefined;
  const date = typeof raw === 'string' ? new Date(raw) : null;
  if (!date || Number.isNaN(date.getTime())) throw new FieldError(message);
  return date.toISOString();
}

/**
 * Respuesta de error común: 400 para validaciones, 500 (con log) para el resto.
 * `action` describe qué se intentaba, para el log del servidor.
 */
function sendError(res, err, action) {
  if (err instanceof FieldError) return res.status(400).json({ message: err.message });
  console.error(`Error ${action}:`, err);
  return res.status(500).json({ message: 'Error interno. Inténtalo de nuevo.' });
}

module.exports = {
  FieldError,
  isUuid,
  requiredText,
  optionalText,
  money,
  integerBetween,
  oneOf,
  boolean,
  optionalUuid,
  dateTime,
  sendError,
};
