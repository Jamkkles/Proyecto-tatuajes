const pool = require('../config/db');
const { ConflictError } = require('../utils/fields');
const { dateLabel, timeLabel } = require('../utils/chileTime');

const COLUMNS = `
  id, user_id, project_id, starts_at, duration_minutes, price, paid, paid_at, rating, status,
  notes, created_at, updated_at
`;

/**
 * Citas del artista en un rango [from, to), para el calendario. Cada una trae
 * el proyecto y el cliente, que es lo que se muestra en la agenda.
 */
async function listByUser(userId, { from, to }) {
  const { rows } = await pool.query(
    `SELECT ps.id, ps.user_id, ps.project_id, ps.starts_at, ps.duration_minutes,
            ps.price, ps.paid, ps.paid_at, ps.rating, ps.status, ps.notes, ps.created_at, ps.updated_at,
            p.title AS project_title, p.body_zone,
            c.id AS client_id, c.name AS client_name, c.phone AS client_phone,
            (SELECT m.status FROM message_log m
              WHERE m.session_id = ps.id AND m.kind = 'recordatorio'
              ORDER BY m.created_at DESC LIMIT 1) AS reminder_status
       FROM project_sessions ps
       JOIN projects p ON p.id = ps.project_id
       JOIN clients c ON c.id = p.client_id
      WHERE ps.user_id = $1 AND ps.starts_at >= $2 AND ps.starts_at < $3
      ORDER BY ps.starts_at`,
    [userId, from, to]
  );
  return rows;
}

/**
 * Plata del artista en un rango [from, to), en pesos.
 *
 * - `collected`: lo que se **cobró** en el rango, por la fecha en que se marcó pagada
 *   (`paid_at`), sin importar cuándo es la cita. Las canceladas no cuentan.
 * - `pending`: lo que falta cobrar de las citas del rango (agendadas o ya hechas, aún
 *   sin pagar). Un «no asistió» sin pagar no es plata por cobrar.
 */
async function incomeByUser(userId, { from, to }) {
  const { rows } = await pool.query(
    `SELECT
       COALESCE(SUM(price) FILTER (
         WHERE paid AND status <> 'cancelada' AND paid_at >= $2 AND paid_at < $3
       ), 0)::bigint AS collected,
       COALESCE(SUM(price) FILTER (
         WHERE NOT paid AND status IN ('agendada', 'completada')
           AND starts_at >= $2 AND starts_at < $3
       ), 0)::bigint AS pending
       FROM project_sessions
      WHERE user_id = $1`,
    [userId, from, to]
  );
  return { collected: Number(rows[0].collected), pending: Number(rows[0].pending) };
}

/** Sesiones de un proyecto en orden cronológico, cada una con sus fotos. */
async function listByProject(projectId, userId) {
  const { rows } = await pool.query(
    `SELECT ps.id, ps.user_id, ps.project_id, ps.starts_at, ps.duration_minutes,
            ps.price, ps.paid, ps.paid_at, ps.rating, ps.status, ps.notes, ps.created_at, ps.updated_at,
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

/**
 * La sesión con su cliente y el nombre del artista: lo que hace falta para
 * escribirle al cliente sobre ella (HU22, HU23, HU28).
 */
async function findWithClient(id, userId) {
  const { rows } = await pool.query(
    `SELECT ps.id, ps.user_id, ps.starts_at, ps.status,
            c.id AS client_id, c.name AS client_name, c.phone AS client_phone,
            u.name AS artist_name
       FROM project_sessions ps
       JOIN projects p ON p.id = ps.project_id
       JOIN clients c ON c.id = p.client_id
       JOIN users u ON u.id = ps.user_id
      WHERE ps.id = $1 AND ps.user_id = $2`,
    [id, userId]
  );
  return rows[0] ?? null;
}

async function findByIdForUser(id, userId) {
  const { rows } = await pool.query(
    `SELECT ${COLUMNS} FROM project_sessions WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  return rows[0] ?? null;
}

/*
 * Un horario ocupado no se puede volver a agendar: dos citas del mismo artista no
 * pueden solaparse. Cuentan las agendadas y las ya hechas; una cancelada o un «no
 * asistió» dejan libre la hora. Las citas contiguas (una termina a las 15:00 y la
 * otra empieza a las 15:00) no se solapan.
 *
 * La revisión y el guardado van juntos bajo un candado por artista: sin él, dos
 * peticiones simultáneas (doble clic, dos pestañas) pasarían la revisión a la vez y
 * quedarían las dos.
 */
const OCCUPYING = ['agendada', 'completada'];
const occupies = (status) => OCCUPYING.includes(status);

/** Ejecuta `work(client)` en una transacción con el candado del artista. */
async function withArtistLock(userId, work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))', [userId]);
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

/** Lanza ConflictError si [startsAt, startsAt + duración) pisa otra cita del artista. */
async function assertSlotFree(db, userId, startsAt, durationMinutes, excludeId = null) {
  const { rows } = await db.query(
    `SELECT ps.starts_at, ps.duration_minutes, c.name AS client_name
       FROM project_sessions ps
       JOIN projects p ON p.id = ps.project_id
       JOIN clients c ON c.id = p.client_id
      WHERE ps.user_id = $1
        AND ps.status IN ('agendada', 'completada')
        AND ($4::uuid IS NULL OR ps.id <> $4::uuid)
        AND ps.starts_at < $2::timestamptz + make_interval(mins => $3::int)
        AND ps.starts_at + make_interval(mins => ps.duration_minutes) > $2::timestamptz
      ORDER BY ps.starts_at
      LIMIT 1`,
    [userId, startsAt, durationMinutes, excludeId]
  );
  if (rows.length === 0) return;

  const other = rows[0];
  const from = new Date(other.starts_at);
  const to = new Date(from.getTime() + other.duration_minutes * 60_000);
  throw new ConflictError(
    `Ese horario se cruza con la cita de ${other.client_name} del ${dateLabel(from)}, de ${timeLabel(from)} a ${timeLabel(to)}. Elige otra hora.`
  );
}

/**
 * Agenda la sesión solo si el proyecto es del artista. Null si no lo es. Lanza
 * ConflictError si la hora ya está ocupada.
 */
async function create(data) {
  const durationMinutes = data.durationMinutes ?? 120;
  const status = data.status ?? 'agendada';

  return withArtistLock(data.userId, async (db) => {
    if (occupies(status)) await assertSlotFree(db, data.userId, data.startsAt, durationMinutes);

    const { rows } = await db.query(
      `INSERT INTO project_sessions
         (user_id, project_id, starts_at, duration_minutes, price, paid, paid_at, status, notes)
       SELECT $1, p.id, $3, $4, $5, $6::boolean, CASE WHEN $6::boolean THEN now() END, $7, $8
         FROM projects p
        WHERE p.id = $2 AND p.user_id = $1
       RETURNING ${COLUMNS}`,
      [
        data.userId,
        data.projectId,
        data.startsAt,
        durationMinutes,
        data.price ?? 0,
        data.paid ?? false,
        status,
        data.notes ?? null,
      ]
    );
    return rows[0] ?? null;
  });
}

// Solo estos campos son editables; la lista evita inyección al construir el SET.
const EDITABLE = {
  startsAt: 'starts_at',
  durationMinutes: 'duration_minutes',
  price: 'price',
  rating: 'rating',
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

  // Pagar o despagar también sella o borra la fecha de pago. Si ya estaba pagada y se
  // vuelve a marcar, se conserva la fecha original.
  if (fields.paid !== undefined) {
    params.push(fields.paid);
    sets.push(`paid = $${params.length}::boolean`);
    sets.push(`paid_at = CASE WHEN $${params.length}::boolean THEN COALESCE(paid_at, now()) END`);
  }

  if (sets.length === 0) return findByIdForUser(id, userId);

  sets.push('updated_at = now()');
  params.push(id, userId);

  return withArtistLock(userId, async (db) => {
    // Solo se revisa el horario si el cambio puede crear un choque: se movió la hora, se
    // alargó la cita, o una cancelada vuelve a ocupar su lugar. Cambiar el monto o las
    // notas de una cita que (por datos antiguos) ya se solapaba no debe quedar bloqueado.
    const { rows: current } = await db.query(
      `SELECT starts_at, duration_minutes, status FROM project_sessions
        WHERE id = $1 AND user_id = $2 FOR UPDATE`,
      [id, userId]
    );
    if (current.length === 0) return null;

    const before = current[0];
    const next = {
      startsAt: fields.startsAt ?? before.starts_at,
      durationMinutes: fields.durationMinutes ?? before.duration_minutes,
      status: fields.status ?? before.status,
    };
    const moved =
      new Date(next.startsAt).getTime() !== new Date(before.starts_at).getTime() ||
      next.durationMinutes !== before.duration_minutes;
    const reoccupies = occupies(next.status) && !occupies(before.status);
    if (occupies(next.status) && (moved || reoccupies)) {
      await assertSlotFree(db, userId, next.startsAt, next.durationMinutes, id);
    }

    const { rows } = await db.query(
      `UPDATE project_sessions SET ${sets.join(', ')}
        WHERE id = $${params.length - 1} AND user_id = $${params.length}
        RETURNING ${COLUMNS}`,
      params
    );
    return rows[0] ?? null;
  });
}

async function remove(id, userId) {
  const { rows } = await pool.query(
    'DELETE FROM project_sessions WHERE id = $1 AND user_id = $2 RETURNING id',
    [id, userId]
  );
  return rows[0] ?? null;
}

module.exports = {
  listByUser,
  incomeByUser,
  listByProject,
  findByIdForUser,
  findWithClient,
  create,
  update,
  remove,
};
