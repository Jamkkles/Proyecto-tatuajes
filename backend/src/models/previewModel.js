const pool = require('../config/db');

const PUBLIC_COLUMNS = `
  id, user_id, name, model_id, camera, placements, created_at, updated_at
`;

/** Lista las escenas de un usuario, de más nueva a más vieja. */
async function listByUser(userId) {
  const { rows } = await pool.query(
    `SELECT ${PUBLIC_COLUMNS} FROM previews WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );
  return rows;
}

/** Busca una escena que pertenezca a ese usuario. Null si no es suya. */
async function findByIdForUser(id, userId) {
  const { rows } = await pool.query(
    `SELECT ${PUBLIC_COLUMNS} FROM previews WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  return rows[0] ?? null;
}

async function create(data) {
  const { rows } = await pool.query(
    `INSERT INTO previews (user_id, name, model_id, camera, placements)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${PUBLIC_COLUMNS}`,
    [
      data.userId,
      data.name,
      data.modelId,
      JSON.stringify(data.camera ?? null),
      JSON.stringify(data.placements ?? []),
    ]
  );
  return rows[0];
}

// Solo estos campos son editables; la lista evita inyección al construir el SET.
const EDITABLE = {
  name: 'name',
  modelId: 'model_id',
  camera: 'camera',
  placements: 'placements',
};
// Columnas JSONB: hay que serializarlas antes de pasarlas como parámetro.
const JSON_COLUMNS = new Set(['camera', 'placements']);

/** Actualiza la escena. Null si no existe o no pertenece al usuario. */
async function update(id, userId, fields) {
  const sets = [];
  const params = [];

  for (const [key, column] of Object.entries(EDITABLE)) {
    if (fields[key] === undefined) continue;
    params.push(JSON_COLUMNS.has(column) ? JSON.stringify(fields[key]) : fields[key]);
    sets.push(`${column} = $${params.length}`);
  }

  if (sets.length === 0) return findByIdForUser(id, userId);

  sets.push('updated_at = now()');
  params.push(id, userId);

  const { rows } = await pool.query(
    `UPDATE previews SET ${sets.join(', ')}
      WHERE id = $${params.length - 1} AND user_id = $${params.length}
      RETURNING ${PUBLIC_COLUMNS}`,
    params
  );
  return rows[0] ?? null;
}

async function remove(id, userId) {
  const { rows } = await pool.query(
    'DELETE FROM previews WHERE id = $1 AND user_id = $2 RETURNING id',
    [id, userId]
  );
  return rows[0] ?? null;
}

/**
 * De la lista de ids dada, devuelve los que realmente son bocetos del usuario.
 * Sirve para rechazar escenas que referencien bocetos ajenos o inexistentes.
 */
async function ownedSketchIds(ids, userId) {
  if (ids.length === 0) return [];
  const { rows } = await pool.query(
    'SELECT id FROM sketches WHERE id = ANY($1::uuid[]) AND user_id = $2',
    [ids, userId]
  );
  return rows.map((r) => r.id);
}

module.exports = { listByUser, findByIdForUser, create, update, remove, ownedSketchIds };
