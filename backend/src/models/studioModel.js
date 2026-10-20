const pool = require('../config/db');

/*
 * Estudios (HU31–HU36). Agrupan las cuentas de los tatuadores para el administrador:
 * los datos de trabajo (clientes, agenda, inventario…) siguen siendo de cada tatuador.
 */

const STUDIO_COLUMNS = 'id, name, email, plan, active, deactivated_at, created_at, updated_at';
const USER_COLUMNS = 'id, name, email, role, active, studio_id, created_at';

/** Ejecuta `work(client)` en una transacción. */
async function inTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function insertStudio(db, { name, email, plan = 'basico' }) {
  const { rows } = await db.query(
    `INSERT INTO studios (name, email, plan) VALUES ($1, $2, $3) RETURNING ${STUDIO_COLUMNS}`,
    [name, email, plan]
  );
  return rows[0];
}

async function insertUser(db, { name, email, passwordHash, studioId, role = 'tatuador' }) {
  const { rows } = await db.query(
    `INSERT INTO users (name, email, password_hash, role, studio_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${USER_COLUMNS}`,
    [name, email, passwordHash, role, studioId]
  );
  return rows[0];
}

/**
 * Crea un estudio con su primer tatuador, todo o nada (HU31, y también el registro abierto:
 * quien se registra queda como su propio estudio con plan básico).
 */
function createWithOwner({ studio, owner }) {
  return inTransaction(async (db) => {
    const created = await insertStudio(db, studio);
    const user = await insertUser(db, { ...owner, studioId: created.id });
    return { studio: created, user };
  });
}

/** Agrega un tatuador a un estudio existente (HU33). Null si el estudio no existe. */
async function addTattooist(studioId, { name, email, passwordHash }) {
  return inTransaction(async (db) => {
    const { rows } = await db.query('SELECT id FROM studios WHERE id = $1 FOR UPDATE', [studioId]);
    if (rows.length === 0) return null;
    return insertUser(db, { name, email, passwordHash, studioId });
  });
}

/**
 * A cada tatuador sin estudio le crea uno propio con su nombre y correo. Lo llama `db:init`:
 * así las cuentas que existían antes de los estudios (y el usuario de prueba) quedan
 * ordenadas. Es idempotente: quien ya tiene estudio no se toca.
 *
 * @returns {Promise<number>} cuántos estudios creó
 */
async function ensureOwnStudios() {
  return inTransaction(async (db) => {
    const { rows } = await db.query(
      `SELECT id, name, email FROM users
        WHERE studio_id IS NULL AND role = 'tatuador'
        ORDER BY created_at
        FOR UPDATE`
    );
    for (const user of rows) {
      const studio = await insertStudio(db, { name: user.name, email: user.email });
      await db.query('UPDATE users SET studio_id = $1 WHERE id = $2', [studio.id, user.id]);
    }
    return rows.length;
  });
}

async function findById(id) {
  const { rows } = await pool.query(`SELECT ${STUDIO_COLUMNS} FROM studios WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

const EDITABLE = { name: 'name', email: 'email', plan: 'plan' };

/**
 * Cambia datos del estudio y/o lo activa o desactiva (HU32). Null si no existe.
 * Desactivar sella `deactivated_at`; reactivar lo borra.
 */
async function update(id, fields) {
  const sets = [];
  const params = [];
  for (const [key, column] of Object.entries(EDITABLE)) {
    if (fields[key] === undefined) continue;
    params.push(fields[key]);
    sets.push(`${column} = $${params.length}`);
  }
  if (fields.active !== undefined) {
    params.push(fields.active);
    sets.push(`active = $${params.length}::boolean`);
    sets.push(`deactivated_at = CASE WHEN $${params.length}::boolean THEN NULL ELSE COALESCE(deactivated_at, now()) END`);
  }
  if (sets.length === 0) return findById(id);

  sets.push('updated_at = now()');
  params.push(id);
  const { rows } = await pool.query(
    `UPDATE studios SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING ${STUDIO_COLUMNS}`,
    params
  );
  return rows[0] ?? null;
}

/**
 * Todos los estudios con sus tatuadores y sus números de uso (HU35, HU36): sesiones
 * registradas, citas agendadas por venir, bocetos y clientes, sumando los de todos sus
 * tatuadores. Los más recientes primero.
 */
async function listWithStats() {
  const { rows } = await pool.query(
    `SELECT s.id, s.name, s.email, s.plan, s.active, s.deactivated_at, s.created_at, s.updated_at,
            COALESCE(t.tattooists, '[]'::json) AS tattooists,
            COALESCE(m.sessions_total, 0)::int AS sessions_total,
            COALESCE(m.upcoming_appointments, 0)::int AS upcoming_appointments,
            COALESCE(k.sketches_total, 0)::int AS sketches_total,
            COALESCE(c.clients_total, 0)::int AS clients_total,
            GREATEST(m.last_session_at, k.last_sketch_at) AS last_activity_at
       FROM studios s
       LEFT JOIN LATERAL (
         SELECT json_agg(json_build_object(
                  'id', u.id, 'name', u.name, 'email', u.email, 'role', u.role,
                  'active', u.active, 'created_at', u.created_at
                ) ORDER BY u.created_at) AS tattooists
           FROM users u WHERE u.studio_id = s.id
       ) t ON true
       LEFT JOIN LATERAL (
         SELECT count(*) AS sessions_total,
                count(*) FILTER (WHERE ps.status = 'agendada' AND ps.starts_at >= now()) AS upcoming_appointments,
                max(ps.created_at) AS last_session_at
           FROM project_sessions ps JOIN users u ON u.id = ps.user_id
          WHERE u.studio_id = s.id
       ) m ON true
       LEFT JOIN LATERAL (
         SELECT count(*) AS sketches_total, max(sk.created_at) AS last_sketch_at
           FROM sketches sk JOIN users u ON u.id = sk.user_id
          WHERE u.studio_id = s.id
       ) k ON true
       LEFT JOIN LATERAL (
         SELECT count(*) AS clients_total
           FROM clients cl JOIN users u ON u.id = cl.user_id
          WHERE u.studio_id = s.id
       ) c ON true
      ORDER BY s.created_at DESC`
  );
  return rows;
}

module.exports = {
  createWithOwner,
  addTattooist,
  ensureOwnStudios,
  findById,
  update,
  listWithStats,
};
