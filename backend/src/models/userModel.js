const pool = require('../config/db');

/** Busca un usuario por correo (case-insensitive). Devuelve la fila o null. */
async function findByEmail(email) {
  const { rows } = await pool.query(
    `SELECT u.id, u.name, u.email, u.password_hash, u.role, u.active, u.studio_id,
            s.active AS studio_active
       FROM users u
       LEFT JOIN studios s ON s.id = u.studio_id
      WHERE lower(u.email) = lower($1)
      LIMIT 1`,
    [email]
  );
  return rows[0] ?? null;
}

/**
 * Lo que decide si una cuenta puede seguir usando la app: su rol, si está activa y si su
 * estudio lo está. Null si la cuenta ya no existe.
 */
async function findAccess(id) {
  const { rows } = await pool.query(
    `SELECT u.id, u.role, u.active, s.active AS studio_active
       FROM users u
       LEFT JOIN studios s ON s.id = u.studio_id
      WHERE u.id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

/** Datos públicos de un usuario (sin el hash), para el administrador. Null si no existe. */
async function findById(id) {
  const { rows } = await pool.query(
    'SELECT id, name, email, role, active, studio_id, created_at FROM users WHERE id = $1',
    [id]
  );
  return rows[0] ?? null;
}

/** Activa o desactiva una cuenta (HU34). Devuelve la fila o null si no existe. */
async function setActive(id, active) {
  const { rows } = await pool.query(
    `UPDATE users SET active = $2 WHERE id = $1
     RETURNING id, name, email, role, active, studio_id, created_at`,
    [id, active]
  );
  return rows[0] ?? null;
}

/**
 * Todas las cuentas de la plataforma, para el administrador (HU35, HU36): su estudio y su
 * uso (sesiones, citas por venir, bocetos, clientes, última actividad). Nunca el hash.
 * Las más recientes primero.
 */
async function listAllWithStats() {
  const { rows } = await pool.query(
    `SELECT u.id, u.name, u.email, u.role, u.active, u.created_at, u.studio_id,
            s.name AS studio_name, s.plan AS studio_plan, s.active AS studio_active,
            COALESCE(m.sessions_total, 0)::int AS sessions_total,
            COALESCE(m.upcoming_appointments, 0)::int AS upcoming_appointments,
            COALESCE(k.sketches_total, 0)::int AS sketches_total,
            COALESCE(c.clients_total, 0)::int AS clients_total,
            GREATEST(m.last_session_at, k.last_sketch_at) AS last_activity_at
       FROM users u
       LEFT JOIN studios s ON s.id = u.studio_id
       LEFT JOIN LATERAL (
         SELECT count(*) AS sessions_total,
                count(*) FILTER (WHERE ps.status = 'agendada' AND ps.starts_at >= now()) AS upcoming_appointments,
                max(ps.created_at) AS last_session_at
           FROM project_sessions ps WHERE ps.user_id = u.id
       ) m ON true
       LEFT JOIN LATERAL (
         SELECT count(*) AS sketches_total, max(sk.created_at) AS last_sketch_at
           FROM sketches sk WHERE sk.user_id = u.id
       ) k ON true
       LEFT JOIN LATERAL (
         SELECT count(*) AS clients_total FROM clients cl WHERE cl.user_id = u.id
       ) c ON true
      ORDER BY u.created_at DESC`
  );
  return rows;
}

/** Cuántos administradores activos hay (para no dejar la plataforma sin ninguno). */
async function countActiveAdmins() {
  const { rows } = await pool.query("SELECT count(*)::int AS n FROM users WHERE role = 'admin' AND active");
  return rows[0].n;
}

/** Crea un usuario y devuelve sus datos públicos (sin el hash). */
async function create({ name, email, passwordHash }) {
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash)
     VALUES ($1, $2, $3)
     RETURNING id, name, email`,
    [name, email, passwordHash]
  );
  return rows[0];
}

/** Actualiza el hash de contraseña de un usuario. */
async function updatePassword(userId, passwordHash) {
  await pool.query(
    'UPDATE users SET password_hash = $1 WHERE id = $2',
    [passwordHash, userId],
  );
}

module.exports = {
  findByEmail,
  findAccess,
  findById,
  listAllWithStats,
  setActive,
  countActiveAdmins,
  create,
  updatePassword,
};
