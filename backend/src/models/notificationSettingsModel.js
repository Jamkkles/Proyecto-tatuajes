const pool = require('../config/db');

/**
 * Valores de un artista que nunca tocó su configuración (no tiene fila). Son los
 * mismos DEFAULT de la tabla en schema.sql; un test los compara para que no se
 * desincronicen.
 */
const DEFAULT_SETTINGS = {
  remindersEnabled: true,
  changeNoticeEnabled: true,
  aftercareEnabled: true,
  reminderNote: 'Si no puedes asistir, avísanos con anticipación.',
  aftercareNote:
    'Mantén la zona limpia y cubierta las primeras horas, lávala con jabón neutro, aplica una capa fina de crema cicatrizante y evita el sol, el mar y la piscina por dos semanas.',
};

const toSettings = (row) => ({
  remindersEnabled: row.reminders_enabled,
  changeNoticeEnabled: row.change_notice_enabled,
  aftercareEnabled: row.aftercare_enabled,
  reminderNote: row.reminder_note,
  aftercareNote: row.aftercare_note,
});

async function get(userId) {
  const { rows } = await pool.query(
    `SELECT reminders_enabled, change_notice_enabled, aftercare_enabled,
            reminder_note, aftercare_note
       FROM notification_settings WHERE user_id = $1`,
    [userId]
  );
  return rows[0] ? toSettings(rows[0]) : { ...DEFAULT_SETTINGS };
}

const COLUMNS = {
  remindersEnabled: 'reminders_enabled',
  changeNoticeEnabled: 'change_notice_enabled',
  aftercareEnabled: 'aftercare_enabled',
  reminderNote: 'reminder_note',
  aftercareNote: 'aftercare_note',
};

/** Guarda solo lo que viene; lo demás queda como estaba (o por defecto). */
async function save(userId, fields) {
  const keys = Object.keys(COLUMNS).filter((k) => fields[k] !== undefined);
  if (keys.length === 0) return get(userId);

  const columns = keys.map((k) => COLUMNS[k]);
  const values = keys.map((k) => fields[k]);
  const placeholders = values.map((_, i) => `$${i + 2}`);
  const updates = columns.map((c) => `${c} = EXCLUDED.${c}`);

  await pool.query(
    `INSERT INTO notification_settings (user_id, ${columns.join(', ')})
     VALUES ($1, ${placeholders.join(', ')})
     ON CONFLICT (user_id) DO UPDATE SET ${updates.join(', ')}, updated_at = now()`,
    [userId, ...values]
  );
  return get(userId);
}

module.exports = { DEFAULT_SETTINGS, get, save };
