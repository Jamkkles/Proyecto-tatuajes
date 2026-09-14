const pool = require('../config/db');

const COLUMNS = 'id, user_id, name, phone, email, instagram, notes, created_at, updated_at';

// Resumen para la lista de clientes: cuántos proyectos tiene y cuándo es su
// próxima cita agendada.
const SELECT_WITH_SUMMARY = `
  SELECT c.id, c.user_id, c.name, c.phone, c.email, c.instagram, c.notes,
         c.created_at, c.updated_at,
         COALESCE(x.projects_count, 0)::int AS projects_count,
         x.next_session_at
    FROM clients c
    LEFT JOIN LATERAL (
      SELECT count(DISTINCT p.id) AS projects_count,
             min(ps.starts_at) FILTER (
               WHERE ps.status = 'agendada' AND ps.starts_at >= now()
             ) AS next_session_at
        FROM projects p
        LEFT JOIN project_sessions ps ON ps.project_id = p.id
       WHERE p.client_id = c.id
    ) x ON true
`;

/** Lista los clientes del artista por nombre. `q` busca en nombre y contacto. */
async function listByUser(userId, { q } = {}) {
  const params = [userId];
  let sql = `${SELECT_WITH_SUMMARY} WHERE c.user_id = $1`;

  if (q) {
    // Se escapan los comodines de LIKE para que "50%" se busque literal.
    params.push(`%${q.replace(/[\\%_]/g, '\\$&')}%`);
    sql += ` AND (c.name ILIKE $2 OR c.phone ILIKE $2 OR c.email ILIKE $2 OR c.instagram ILIKE $2)`;
  }

  sql += ' ORDER BY lower(c.name)';
  const { rows } = await pool.query(sql, params);
  return rows;
}

/** Busca un cliente del artista. Null si no existe o es de otro. */
async function findByIdForUser(id, userId) {
  const { rows } = await pool.query(
    `${SELECT_WITH_SUMMARY} WHERE c.id = $1 AND c.user_id = $2`,
    [id, userId]
  );
  return rows[0] ?? null;
}

async function create(data) {
  const { rows } = await pool.query(
    `INSERT INTO clients (user_id, name, phone, email, instagram, notes)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${COLUMNS}`,
    [
      data.userId,
      data.name,
      data.phone ?? null,
      data.email ?? null,
      data.instagram ?? null,
      data.notes ?? null,
    ]
  );
  // Un cliente recién creado no tiene proyectos: se completa el resumen aquí
  // para que la respuesta tenga la misma forma que la lista.
  return { ...rows[0], projects_count: 0, next_session_at: null };
}

// Solo estos campos son editables; la lista evita inyección al construir el SET.
const EDITABLE = {
  name: 'name',
  phone: 'phone',
  email: 'email',
  instagram: 'instagram',
  notes: 'notes',
};

/** Actualiza el contacto. Null si no existe o es de otro artista. */
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
      `UPDATE clients SET ${sets.join(', ')}
        WHERE id = $${params.length - 1} AND user_id = $${params.length}`,
      params
    );
    if (rowCount === 0) return null;
  }

  return findByIdForUser(id, userId);
}

/** Borra el cliente; sus proyectos, sesiones y fotos caen en cascada. */
async function remove(id, userId) {
  const { rows } = await pool.query(
    'DELETE FROM clients WHERE id = $1 AND user_id = $2 RETURNING id',
    [id, userId]
  );
  return rows[0] ?? null;
}

module.exports = { listByUser, findByIdForUser, create, update, remove };
