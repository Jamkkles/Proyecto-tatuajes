const pool = require('../config/db');

/**
 * Guarda el dispositivo. El `endpoint` es único: si otra cuenta inicia sesión
 * en el mismo teléfono, la suscripción pasa a ella en vez de duplicarse, y los
 * avisos de una cuenta no terminan en el teléfono de otra persona.
 */
async function save({ userId, endpoint, p256dh, auth, userAgent = null }) {
  const { rows } = await pool.query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (endpoint) DO UPDATE
       SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh,
           auth = EXCLUDED.auth, user_agent = EXCLUDED.user_agent
     RETURNING id`,
    [userId, endpoint, p256dh, auth, userAgent]
  );
  return rows[0];
}

async function listByUser(userId) {
  const { rows } = await pool.query(
    'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1',
    [userId]
  );
  return rows;
}

async function removeByEndpoint(userId, endpoint) {
  const { rowCount } = await pool.query(
    'DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2',
    [userId, endpoint]
  );
  return rowCount;
}

/** Para limpiar las que el servicio de push dio por muertas (404/410). */
async function removeById(id) {
  await pool.query('DELETE FROM push_subscriptions WHERE id = $1', [id]);
}

module.exports = { save, listByUser, removeByEndpoint, removeById };
