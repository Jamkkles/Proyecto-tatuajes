const pool = require('../config/db');

const COLUMNS = 'id, user_id, kind, title, body, url, data, read_at, created_at';

/**
 * Crea un aviso. Con `dedupeKey` repetido para el mismo artista no hace nada y
 * devuelve null: así «insumo bajo» no avisa mil veces por el mismo insumo.
 */
async function create({ userId, kind, title, body = '', url = null, data = {}, dedupeKey = null }) {
  const { rows } = await pool.query(
    `INSERT INTO notifications (user_id, kind, title, body, url, data, dedupe_key)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
     RETURNING ${COLUMNS}`,
    [userId, kind, title, body, url, JSON.stringify(data), dedupeKey]
  );
  return rows[0] ?? null;
}

/** Los más recientes primero, con cuántos hay sin leer en total. */
async function listByUser(userId, { limit = 30 } = {}) {
  const [list, unread] = await Promise.all([
    pool.query(
      `SELECT ${COLUMNS} FROM notifications
        WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [userId, limit]
    ),
    pool.query(
      'SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL',
      [userId]
    ),
  ]);
  return { notifications: list.rows, unread: unread.rows[0].n };
}

/** Marca como leídos los ids dados (solo si son del artista), o todos. */
async function markRead(userId, { ids, all }) {
  if (all) {
    const { rowCount } = await pool.query(
      'UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL',
      [userId]
    );
    return rowCount;
  }
  if (!ids?.length) return 0;
  const { rowCount } = await pool.query(
    `UPDATE notifications SET read_at = now()
      WHERE user_id = $1 AND id = ANY($2::uuid[]) AND read_at IS NULL`,
    [userId, ids]
  );
  return rowCount;
}

module.exports = { create, listByUser, markRead };
