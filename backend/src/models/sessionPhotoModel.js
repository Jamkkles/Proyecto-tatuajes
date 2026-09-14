const pool = require('../config/db');

// `storage_driver` y `storage_key` son detalles internos del almacenamiento y
// no salen hacia el frontend.
const PUBLIC_COLUMNS = `
  id, session_id, caption, url, mime_type, size_bytes, width, height, created_at
`;

/** Registra la foto una vez subida, solo si la sesión es del artista. */
async function create(data) {
  const { rows } = await pool.query(
    `INSERT INTO session_photos
       (user_id, session_id, caption, storage_driver, storage_key, url,
        mime_type, size_bytes, width, height)
     SELECT $1, ps.id, $3, $4, $5, $6, $7, $8, $9, $10
       FROM project_sessions ps
      WHERE ps.id = $2 AND ps.user_id = $1
     RETURNING ${PUBLIC_COLUMNS}`,
    [
      data.userId,
      data.sessionId,
      data.caption ?? null,
      data.storageDriver,
      data.storageKey,
      data.url,
      data.mimeType,
      data.sizeBytes,
      data.width,
      data.height,
    ]
  );
  return rows[0] ?? null;
}

/** Borra la foto y devuelve la referencia al archivo para eliminarlo. */
async function remove(id, sessionId, userId) {
  const { rows } = await pool.query(
    `DELETE FROM session_photos
      WHERE id = $1 AND session_id = $2 AND user_id = $3
      RETURNING id, storage_driver, storage_key`,
    [id, sessionId, userId]
  );
  return rows[0] ?? null;
}

// Desde qué nivel se buscan las fotos. Lista cerrada: la columna se interpola.
const SCOPES = {
  client: 'p.client_id',
  project: 'ps.project_id',
  session: 'ps.id',
};

/**
 * Archivos de todas las fotos que cuelgan de un cliente, proyecto o sesión.
 * Se consultan ANTES de borrar el padre: la cascada elimina las filas y sin
 * esto no quedaría forma de saber qué archivos borrar del almacenamiento.
 */
async function filesFor(scope, id, userId) {
  const column = SCOPES[scope];
  const { rows } = await pool.query(
    `SELECT f.storage_driver, f.storage_key
       FROM session_photos f
       JOIN project_sessions ps ON ps.id = f.session_id
       JOIN projects p ON p.id = ps.project_id
      WHERE ${column} = $1 AND f.user_id = $2`,
    [id, userId]
  );
  return rows;
}

module.exports = { create, remove, filesFor };
