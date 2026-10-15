/**
 * Fechas y horas como las lee una persona en Chile.
 *
 * Las citas se guardan en UTC (timestamptz), pero el cliente tiene que leer «15:30»
 * y no «18:30». El servidor corre en UTC, así que la zona se pide explícita.
 * Se arma a mano con `formatToParts` porque `toLocaleString('es-CL')` devuelve
 * «03:30 p. m.» y «viernes, 16 de octubre», que en un mensaje queda raro.
 */
const ZONE = 'America/Santiago';

const dateParts = new Intl.DateTimeFormat('es-CL', {
  timeZone: ZONE,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});
const timeParts = new Intl.DateTimeFormat('es-CL', {
  timeZone: ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const pick = (parts, type) => parts.find((p) => p.type === type)?.value ?? '';

/** «viernes 16 de octubre» */
function dateLabel(date) {
  const parts = dateParts.formatToParts(date);
  return `${pick(parts, 'weekday')} ${pick(parts, 'day')} de ${pick(parts, 'month')}`;
}

/** «15:30» */
function timeLabel(date) {
  const parts = timeParts.formatToParts(date);
  return `${pick(parts, 'hour')}:${pick(parts, 'minute')}`;
}

/** Segundos desde 1970: la precisión que se usa en las claves de deduplicación. */
const epochSeconds = (date) => Math.floor(new Date(date).getTime() / 1000);

module.exports = { ZONE, dateLabel, timeLabel, epochSeconds };
