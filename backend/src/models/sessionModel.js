const pool = require('../config/db');

const COLUMNS = `
  id, user_id, project_id, starts_at, duration_minutes, price, paid, status,
  notes, created_at, updated_at
`;

/**
 * Citas del artista en un rango [from, to), para el calendario. Cada una trae
 * el proyecto y el cliente, que es lo que se muestra en la agenda.
 */
async function listByUser(userId, { from, to }) {
  const { rows } = await pool.query(
    `SELECT ps.id, ps.user_id, ps.project_id, ps.starts_at, ps.duration_minutes,
            ps.price, ps.paid, ps.status, ps.notes, ps.created_at, ps.updated_at,
            p.title AS project_title, p.body_zone,
            c.id AS client_id, c.name AS client_name, c.phone AS client_phone
       FROM project_sessions ps
       JOIN projects p ON p.id = ps.project_id
       JOIN clients c ON c.id = p.client_id
      WHERE ps.user_id = $1 AND ps.starts_at >= $2 AND ps.starts_at < $3
      ORDER BY ps.starts_at`,
    [userId, from, to]
  );
  return rows;
}

/** Sesiones de un proyecto en orden cronológico, cada una con sus fotos. */
async function listByProject(projectId, userId) {
  const { rows } = await pool.query(
    `SELECT ps.id, ps.user_id, ps.project_id, ps.starts_at, ps.duration_minutes,
            ps.price, ps.paid, ps.status, ps.notes, ps.created_at, ps.updated_at,
            COALESCE(
              json_agg(
                json_build_object(
                  'id', f.id, 'session_id', f.session_id, 'caption', f.caption,
                  'url', f.url, 'width', f.width, 'height', f.height,
                  'created_at', f.created_at
                ) ORDER BY f.created_at
              ) FILTER (WHERE f.id IS NOT NULL),
              '[]'
            ) AS photos
       FROM project_sessions ps
       LEFT JOIN session_photos f ON f.session_id = ps.id
      WHERE ps.project_id = $1 AND ps.user_id = $2
      GROUP BY ps.id
      ORDER BY ps.starts_at`,
    [projectId, userId]
  );
  return rows;
}

async function findByIdForUser(id, userId) {
  const { rows } = await pool.query(
    `SELECT ${COLUMNS} FROM project_sessions WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  return rows[0] ?? null;
}

/** Agenda la sesión solo si el proyecto es del artista. Null si no lo es. */
async function create(data) {
  const { rows } = await pool.query(
    `INSERT INTO project_sessions
       (user_id, project_id, starts_at, duration_minutes, price, paid, status, notes)
     SELECT $1, p.id, $3, $4, $5, $6, $7, $8
       FROM projects p
      WHERE p.id = $2 AND p.user_id = $1
     RETURNING ${COLUMNS}`,
    [
      data.userId,
      data.projectId,
      data.startsAt,
      data.durationMinutes ?? 120,
      data.price ?? 0,
      data.paid ?? false,
      data.status ?? 'agendada',
      data.notes ?? null,
    ]
  );
  return rows[0] ?? null;
}

// Solo estos campos son editables; la lista evita inyección al construir el SET.
const EDITABLE = {
  startsAt: 'starts_at',
  durationMinutes: 'duration_minutes',
  price: 'price',
  paid: 'paid',
  status: 'status',
  notes: 'notes',
};

async function update(id, userId, fields) {
  const sets = [];
  const params = [];

  for (const [key, column] of Object.entries(EDITABLE)) {
    if (fields[key] === undefined) continue;
    params.push(fields[key]);
    sets.push(`${column} = $${params.length}`);
  }

  if (sets.length === 0) return findByIdForUser(id, userId);

  sets.push('updated_at = now()');
  params.push(id, userId);

  const { rows } = await pool.query(
    `UPDATE project_sessions SET ${sets.join(', ')}
      WHERE id = $${params.length - 1} AND user_id = $${params.length}
      RETURNING ${COLUMNS}`,
    params
  );
  return rows[0] ?? null;
}

async function remove(id, userId) {
  const { rows } = await pool.query(
    'DELETE FROM project_sessions WHERE id = $1 AND user_id = $2 RETURNING id',
    [id, userId]
  );
  return rows[0] ?? null;
}

module.exports = { listByUser, listByProject, findByIdForUser, create, update, remove };
