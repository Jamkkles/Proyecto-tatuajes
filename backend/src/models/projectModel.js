const pool = require('../config/db');

// Un proyecto siempre sale con su resumen económico y de agenda:
//   planned_amount → suma de lo que se cobra en las sesiones no canceladas
//   paid_amount    → suma de las sesiones ya pagadas
// Las sumas de enteros en Postgres son bigint (pg las entrega como texto), por
// eso el ::int.
const SELECT_WITH_SUMMARY = `
  SELECT p.id, p.user_id, p.client_id, p.title, p.description, p.body_zone,
         p.total_price, p.status, p.sketch_id, p.preview_id,
         p.created_at, p.updated_at,
         c.name AS client_name, c.phone AS client_phone,
         sk.url AS sketch_url, pv.name AS preview_name,
         COALESCE(st.sessions_count, 0)::int AS sessions_count,
         COALESCE(st.planned_amount, 0)::int AS planned_amount,
         COALESCE(st.paid_amount, 0)::int AS paid_amount,
         st.next_session_at
    FROM projects p
    JOIN clients c ON c.id = p.client_id
    LEFT JOIN sketches sk ON sk.id = p.sketch_id
    LEFT JOIN previews pv ON pv.id = p.preview_id
    LEFT JOIN LATERAL (
      SELECT count(*) FILTER (WHERE ps.status <> 'cancelada') AS sessions_count,
             sum(ps.price) FILTER (WHERE ps.status <> 'cancelada') AS planned_amount,
             sum(ps.price) FILTER (WHERE ps.paid) AS paid_amount,
             min(ps.starts_at) FILTER (
               WHERE ps.status = 'agendada' AND ps.starts_at >= now()
             ) AS next_session_at
        FROM project_sessions ps
       WHERE ps.project_id = p.id
    ) st ON true
`;

/** Proyectos del artista, de más nuevo a más viejo. Filtros opcionales. */
async function listByUser(userId, { clientId, status } = {}) {
  const params = [userId];
  let sql = `${SELECT_WITH_SUMMARY} WHERE p.user_id = $1`;

  if (clientId) {
    params.push(clientId);
    sql += ` AND p.client_id = $${params.length}`;
  }
  if (status) {
    params.push(status);
    sql += ` AND p.status = $${params.length}`;
  }

  sql += ' ORDER BY p.created_at DESC';
  const { rows } = await pool.query(sql, params);
  return rows;
}

async function findByIdForUser(id, userId) {
  const { rows } = await pool.query(
    `${SELECT_WITH_SUMMARY} WHERE p.id = $1 AND p.user_id = $2`,
    [id, userId]
  );
  return rows[0] ?? null;
}

/**
 * Crea el proyecto solo si el cliente es del artista (INSERT … SELECT: si el
 * cliente no es suyo no se inserta nada). Null en ese caso.
 */
async function create(data) {
  const { rows } = await pool.query(
    `INSERT INTO projects
       (user_id, client_id, title, description, body_zone, total_price, status,
        sketch_id, preview_id)
     SELECT $1, c.id, $3, $4, $5, $6, $7, $8, $9
       FROM clients c
      WHERE c.id = $2 AND c.user_id = $1
     RETURNING id`,
    [
      data.userId,
      data.clientId,
      data.title,
      data.description ?? null,
      data.bodyZone ?? null,
      data.totalPrice ?? 0,
      data.status ?? 'activo',
      data.sketchId ?? null,
      data.previewId ?? null,
    ]
  );
  if (rows.length === 0) return null;
  return findByIdForUser(rows[0].id, data.userId);
}

// Solo estos campos son editables; la lista evita inyección al construir el SET.
// El cliente no se cambia: un proyecto pertenece a quien se lo encargó.
const EDITABLE = {
  title: 'title',
  description: 'description',
  bodyZone: 'body_zone',
  totalPrice: 'total_price',
  status: 'status',
  sketchId: 'sketch_id',
  previewId: 'preview_id',
};

async function update(id, userId, fields) {
  const sets = [];
  const params = [];

  for (const [key, column] of Object.entries(EDITABLE)) {
    if (fields[key] === undefined) continue;
    params.push(fields[key]);
    sets.push(`${column} = $${params.length}`);
  }

  if (sets.length > 0) {
    sets.push('updated_at = now()');
    params.push(id, userId);
    const { rowCount } = await pool.query(
      `UPDATE projects SET ${sets.join(', ')}
        WHERE id = $${params.length - 1} AND user_id = $${params.length}`,
      params
    );
    if (rowCount === 0) return null;
  }

  return findByIdForUser(id, userId);
}

async function remove(id, userId) {
  const { rows } = await pool.query(
    'DELETE FROM projects WHERE id = $1 AND user_id = $2 RETURNING id',
    [id, userId]
  );
  return rows[0] ?? null;
}

// Tablas que un proyecto puede referenciar. Lista cerrada: el nombre de tabla
// se interpola en el SQL.
const REFERENCE_TABLES = { sketch: 'sketches', preview: 'previews' };

/** ¿El boceto / la escena 3D existe y es del artista? */
async function ownsReference(kind, id, userId) {
  const table = REFERENCE_TABLES[kind];
  const { rowCount } = await pool.query(
    `SELECT 1 FROM ${table} WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  return rowCount > 0;
}

module.exports = { listByUser, findByIdForUser, create, update, remove, ownsReference };
