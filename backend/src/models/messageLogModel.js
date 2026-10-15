const pool = require('../config/db');

/**
 * Reclama el envío ANTES de hacerlo. Si otra corrida ya lo reclamó (el programador
 * interno y el externo pueden coincidir), devuelve null y no se manda dos veces.
 */
async function claim({ userId, sessionId, kind, channel, toPhone = null, dedupeKey }) {
  const { rows } = await pool.query(
    `INSERT INTO message_log (user_id, session_id, kind, channel, status, to_phone, dedupe_key)
     VALUES ($1, $2, $3, $4, 'pendiente', $5, $6)
     ON CONFLICT (user_id, dedupe_key) DO NOTHING
     RETURNING id`,
    [userId, sessionId, kind, channel, toPhone, dedupeKey]
  );
  return rows[0] ?? null;
}

async function finish(id, { status, channel, providerId = null, error = null }) {
  await pool.query(
    `UPDATE message_log
        SET status = $2, channel = COALESCE($3, channel), provider_id = $4, error = $5
      WHERE id = $1`,
    [id, status, channel ?? null, providerId, error ? String(error).slice(0, 500) : null]
  );
}

/**
 * Cuántos mensajes salieron por un canal en los últimos `minutes` minutos. Es lo que
 * limita el ritmo del WhatsApp vinculado: se cuenta en la base y no en memoria, para
 * que reiniciar el servidor no reinicie el tope.
 */
async function countRecent(userId, channel, minutes) {
  const { rows } = await pool.query(
    `SELECT count(*)::int AS n FROM message_log
      WHERE user_id = $1 AND channel = $2 AND status = 'enviado'
        AND created_at > now() - make_interval(mins => $3)`,
    [userId, channel, minutes]
  );
  return rows[0].n;
}

module.exports = { claim, finish, countRecent };
