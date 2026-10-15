const pool = require('../config/db');
const { DEFAULT_SETTINGS } = require('./notificationSettingsModel');

/**
 * Citas a las que les toca el recordatorio de 24 horas (HU22).
 *
 * Una cita entra cuando falta entre 1 y 24 horas, así que el recordatorio sale
 * en cuanto se cruza la marca de las 24 horas (o en la siguiente corrida del
 * programador, si estuvo dormido). Tres filtros evitan mensajes absurdos:
 *   - faltan menos de 1 hora: ya no sirve de recordatorio;
 *   - se agendó hace menos de 1 hora: acaban de hablar, sería escribirle al
 *     cliente a los segundos de reservar;
 *   - el artista apagó los recordatorios.
 * La clave de deduplicación lleva la hora de la cita: si se reagenda, el cliente
 * recibe un recordatorio nuevo para la hora nueva.
 *
 * Ojo con el redondeo: la clave se arma en JS con segundos enteros
 * (`epochSeconds`), y aquí con `floor(extract(epoch …))`. Tienen que coincidir.
 */
async function dueForReminder(now = new Date(), { limit = 200 } = {}) {
  const { rows } = await pool.query(
    `SELECT ps.id, ps.user_id, ps.starts_at,
            c.id AS client_id, c.name AS client_name, c.phone AS client_phone,
            u.name AS artist_name,
            COALESCE(ns.reminder_note, $2) AS reminder_note
       FROM project_sessions ps
       JOIN projects p ON p.id = ps.project_id
       JOIN clients c ON c.id = p.client_id
       JOIN users u ON u.id = ps.user_id
       LEFT JOIN notification_settings ns ON ns.user_id = ps.user_id
      WHERE ps.status = 'agendada'
        AND ps.starts_at >  $1::timestamptz + interval '1 hour'
        AND ps.starts_at <= $1::timestamptz + interval '24 hours'
        AND ps.created_at <= $1::timestamptz - interval '1 hour'
        AND COALESCE(ns.reminders_enabled, true)
        AND NOT EXISTS (
          SELECT 1 FROM message_log m
           WHERE m.user_id = ps.user_id
             AND m.dedupe_key = 'recordatorio:' || ps.id || ':' ||
                                floor(extract(epoch FROM ps.starts_at))::bigint
        )
      ORDER BY ps.starts_at
      LIMIT $3`,
    [now, DEFAULT_SETTINGS.reminderNote, limit]
  );
  return rows;
}

module.exports = { dueForReminder };
