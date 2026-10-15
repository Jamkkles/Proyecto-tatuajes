const pool = require('../config/db');

/**
 * Sesión de WhatsApp vinculado de cada artista y sus credenciales.
 *
 * Los valores de `whatsapp_auth` llegan **ya cifrados** (ver utils/secretBox.js): este
 * módulo solo los guarda y los devuelve, nunca ve el contenido.
 */

async function getSession(userId) {
  const { rows } = await pool.query(
    'SELECT status, phone, linked_at FROM whatsapp_sessions WHERE user_id = $1',
    [userId]
  );
  return rows[0] ?? null;
}

async function saveSession(userId, { status, phone = null }) {
  await pool.query(
    `INSERT INTO whatsapp_sessions (user_id, status, phone, linked_at)
     VALUES ($1, $2, $3, CASE WHEN $2 = 'vinculado' THEN now() END)
     ON CONFLICT (user_id) DO UPDATE
       SET status = EXCLUDED.status,
           phone = COALESCE(EXCLUDED.phone, whatsapp_sessions.phone),
           linked_at = CASE
             WHEN EXCLUDED.status = 'vinculado' AND whatsapp_sessions.status <> 'vinculado' THEN now()
             WHEN EXCLUDED.status = 'vinculado' THEN whatsapp_sessions.linked_at
             ELSE NULL END,
           updated_at = now()`,
    [userId, status, phone]
  );
}

/** Desvincular: se borran la sesión y todas sus credenciales. */
async function deleteAll(userId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM whatsapp_auth WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM whatsapp_sessions WHERE user_id = $1', [userId]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function getValue(userId, type, id) {
  const { rows } = await pool.query(
    'SELECT value FROM whatsapp_auth WHERE user_id = $1 AND type = $2 AND id = $3',
    [userId, type, id]
  );
  return rows[0]?.value ?? null;
}

/** Varios valores de un tipo, como `Map<id, valor cifrado>`. */
async function getValues(userId, type, ids) {
  if (!ids.length) return new Map();
  const { rows } = await pool.query(
    'SELECT id, value FROM whatsapp_auth WHERE user_id = $1 AND type = $2 AND id = ANY($3::text[])',
    [userId, type, ids]
  );
  return new Map(rows.map((r) => [r.id, r.value]));
}

/**
 * Guarda o borra varios valores de una vez. `value: null` borra. WhatsApp escribe
 * decenas de claves seguidas al vincularse: van en una sola consulta por tipo de
 * operación, no una por clave.
 */
async function setValues(userId, entries) {
  const puts = entries.filter((e) => e.value !== null && e.value !== undefined);
  const drops = entries.filter((e) => e.value === null || e.value === undefined);

  if (puts.length) {
    await pool.query(
      `INSERT INTO whatsapp_auth (user_id, type, id, value)
       SELECT $1, t.type, t.id, t.value
         FROM unnest($2::text[], $3::text[], $4::text[]) AS t(type, id, value)
       ON CONFLICT (user_id, type, id) DO UPDATE SET value = EXCLUDED.value`,
      [userId, puts.map((e) => e.type), puts.map((e) => e.id), puts.map((e) => e.value)]
    );
  }
  if (drops.length) {
    await pool.query(
      `DELETE FROM whatsapp_auth
        WHERE user_id = $1
          AND (type, id) IN (SELECT t.type, t.id FROM unnest($2::text[], $3::text[]) AS t(type, id))`,
      [userId, drops.map((e) => e.type), drops.map((e) => e.id)]
    );
  }
}

module.exports = { getSession, saveSession, deleteAll, getValue, getValues, setValues };
