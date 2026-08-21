const pool = require('../config/db');

// Columnas que se devuelven al frontend. `storage_driver` y `storage_key` son
// detalles internos del almacenamiento y no salen de la capa de modelo/controlador.
const PUBLIC_COLUMNS = `
  id, user_id, title, description, body_zone, status, tags,
  url, mime_type, size_bytes, width, height, created_at, updated_at
`;

/**
 * Lista la galería de un usuario, de más nuevo a más viejo.
 * Filtros opcionales por estado y por etiqueta.
 */
async function listByUser(userId, { status, tag } = {}) {
  const params = [userId];
  let sql = `SELECT ${PUBLIC_COLUMNS} FROM sketches WHERE user_id = $1`;

  if (status) {
    params.push(status);
    sql += ` AND status = $${params.length}`;
  }
  if (tag) {
    params.push([tag]);
    sql += ` AND tags @> $${params.length}`;
  }

  sql += ' ORDER BY created_at DESC';

  const { rows } = await pool.query(sql, params);
  return rows;
}

/** Busca un boceto que pertenezca a ese usuario. Devuelve null si no es suyo. */
async function findByIdForUser(id, userId) {
  const { rows } = await pool.query(
    `SELECT ${PUBLIC_COLUMNS}, storage_driver, storage_key
       FROM sketches
      WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  return rows[0] ?? null;
}

/** Inserta el registro del boceto una vez que el archivo ya está almacenado. */
async function create(data) {
  const { rows } = await pool.query(
    `INSERT INTO sketches
       (user_id, title, description, body_zone, status, tags,
        storage_driver, storage_key, url, mime_type, size_bytes, width, height)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING ${PUBLIC_COLUMNS}`,
    [
      data.userId,
      data.title,
      data.description,
      data.bodyZone,
      data.status,
      data.tags,
      data.storageDriver,
      data.storageKey,
      data.url,
      data.mimeType,
      data.sizeBytes,
      data.width,
      data.height,
    ]
  );
  return rows[0];
}

// Solo estos campos son editables; la lista evita inyección al construir el SET.
const EDITABLE = {
  title: 'title',
  description: 'description',
  bodyZone: 'body_zone',
  status: 'status',
  tags: 'tags',
};

/**
 * Actualiza los metadatos (no la imagen). Devuelve la fila actualizada,
 * o null si el boceto no existe o no pertenece al usuario.
 */
async function update(id, userId, fields) {
  const sets = [];
  const params = [];

  for (const [key, column] of Object.entries(EDITABLE)) {
    if (fields[key] !== undefined) {
      params.push(fields[key]);
      sets.push(`${column} = $${params.length}`);
    }
  }

  if (sets.length === 0) return findByIdForUser(id, userId);

  sets.push('updated_at = now()');
  params.push(id, userId);

  const { rows } = await pool.query(
    `UPDATE sketches SET ${sets.join(', ')}
      WHERE id = $${params.length - 1} AND user_id = $${params.length}
      RETURNING ${PUBLIC_COLUMNS}`,
    params
  );
  return rows[0] ?? null;
}

/** Borra el registro y devuelve la referencia al archivo para poder eliminarlo. */
async function remove(id, userId) {
  const { rows } = await pool.query(
    `DELETE FROM sketches
      WHERE id = $1 AND user_id = $2
      RETURNING id, storage_driver, storage_key`,
    [id, userId]
  );
  return rows[0] ?? null;
}

module.exports = { listByUser, findByIdForUser, create, update, remove };
