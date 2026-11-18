const pool = require('../config/db');

/**
 * Cotizaciones de insumos (HU14–HU16).
 *
 * Mismas reglas de propiedad que el resto del estudio: todo filtra por
 * `user_id`, un id ajeno devuelve null (el controlador lo traduce a 404) y las
 * referencias a proyecto, boceto o sesión se validan contra filas del mismo
 * artista antes de guardarse.
 *
 * Las columnas NUMERIC se leen con `::float8`: `pg` las entrega como texto
 * para no perder precisión, y al frontend le tienen que llegar como números.
 */

const FIELDS = `
  id, user_id, project_id, sketch_id, session_id, title,
  width_cm::float8   AS width_cm,
  height_cm::float8  AS height_cm,
  ink_ratio::float8  AS ink_ratio,
  stroke, color_mode, sessions_count, estimated_minutes,
  materials_cost, status, consumed_at, created_at, updated_at
`;

// Las mismas columnas calificadas con el alias `q`, para las consultas que
// hacen JOIN con proyecto, cliente y boceto.
const COLUMNS = FIELDS.split(',')
  .map((column) => `q.${column.trim()}`)
  .join(', ');

// Resumen que acompaña a la cotización en los listados: de qué proyecto y
// cliente es, y con qué boceto se calculó.
const SUMMARY = `
  p.title       AS project_title,
  c.name        AS client_name,
  s.title       AS sketch_title,
  s.url         AS sketch_url
`;

const JOINS = `
  FROM quotes q
  LEFT JOIN projects p ON p.id = q.project_id
  LEFT JOIN clients  c ON c.id = p.client_id
  LEFT JOIN sketches s ON s.id = q.sketch_id
`;

const ITEM_COLUMNS = `
  id, quote_id, material_id, name, unit,
  quantity::float8 AS quantity,
  unit_cost, source, position
`;

async function listItems(quoteId, client = pool) {
  const { rows } = await client.query(
    `SELECT ${ITEM_COLUMNS} FROM quote_items WHERE quote_id = $1 ORDER BY position, name`,
    [quoteId]
  );
  return rows;
}

/** Listado del artista, opcionalmente acotado a un proyecto. */
async function listByUser(userId, { projectId } = {}) {
  const params = [userId];
  let sql = `SELECT ${COLUMNS}, ${SUMMARY} ${JOINS} WHERE q.user_id = $1`;

  if (projectId) {
    params.push(projectId);
    sql += ` AND q.project_id = $${params.length}`;
  }
  sql += ' ORDER BY q.created_at DESC';

  const { rows } = await pool.query(sql, params);
  return rows;
}

/** Una cotización con su detalle de insumos. */
async function findByIdForUser(id, userId) {
  const { rows } = await pool.query(
    `SELECT ${COLUMNS}, ${SUMMARY} ${JOINS} WHERE q.id = $1 AND q.user_id = $2`,
    [id, userId]
  );
  if (!rows[0]) return null;
  return { ...rows[0], items: await listItems(id) };
}

/** La cotización enlazada a una sesión, si la hay. La usa HU16 al cerrarla. */
async function findBySession(sessionId, userId, client = pool) {
  const { rows } = await client.query(
    `SELECT ${COLUMNS} ${JOINS} WHERE q.session_id = $1 AND q.user_id = $2`,
    [sessionId, userId]
  );
  return rows[0] ?? null;
}

/**
 * Inserta las líneas de una cotización. Se hace en una sola sentencia con
 * `unnest` en vez de un INSERT por línea: una cotización trae fácil 15 insumos
 * y no tiene sentido pagar 15 viajes a la base.
 */
async function insertItems(quoteId, items, client) {
  if (items.length === 0) return;
  await client.query(
    `INSERT INTO quote_items (quote_id, material_id, name, unit, quantity, unit_cost, source, position)
     SELECT $1, m.material_id, m.name, m.unit, m.quantity, m.unit_cost, m.source, m.position
       FROM unnest($2::uuid[], $3::text[], $4::text[], $5::numeric[], $6::int[], $7::text[], $8::int[])
            AS m(material_id, name, unit, quantity, unit_cost, source, position)`,
    [
      quoteId,
      items.map((i) => i.materialId ?? null),
      items.map((i) => i.name),
      items.map((i) => i.unit),
      items.map((i) => i.quantity),
      items.map((i) => i.unitCost),
      items.map((i) => i.source ?? 'calculado'),
      items.map((_, index) => index),
    ]
  );
}

/**
 * Crea la cotización y su detalle en una transacción: una cotización sin
 * líneas no significa nada, así que o entran las dos cosas o no entra ninguna.
 *
 * Que `projectId`, `sketchId` y `sessionId` sean del mismo artista lo
 * comprueba el controlador antes de llegar aquí (`assertRefs`): la clave
 * foránea solo garantiza que la fila exista, no que sea suya.
 */
async function create(data) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `INSERT INTO quotes
         (user_id, project_id, sketch_id, session_id, title, width_cm, height_cm,
          ink_ratio, stroke, color_mode, sessions_count, estimated_minutes,
          materials_cost, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING ${FIELDS}`,
      [
        data.userId,
        data.projectId ?? null,
        data.sketchId ?? null,
        data.sessionId ?? null,
        data.title,
        data.widthCm,
        data.heightCm,
        data.inkRatio,
        data.stroke,
        data.colorMode,
        data.sessionsCount,
        data.estimatedMinutes,
        data.materialsCost,
        data.status ?? 'borrador',
      ]
    );

    const quote = rows[0];
    await insertItems(quote.id, data.items ?? [], client);
    await client.query('COMMIT');
    // Se relee con el JOIN para devolver la misma forma que el listado y el
    // detalle (con proyecto, cliente y boceto); si no, el frontend recibiría
    // una cotización a medias justo después de crearla.
    return findByIdForUser(quote.id, data.userId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Solo estos campos son editables; la lista evita inyección al construir el SET.
const EDITABLE = {
  title: 'title',
  projectId: 'project_id',
  sketchId: 'sketch_id',
  sessionId: 'session_id',
  widthCm: 'width_cm',
  heightCm: 'height_cm',
  inkRatio: 'ink_ratio',
  stroke: 'stroke',
  colorMode: 'color_mode',
  sessionsCount: 'sessions_count',
  estimatedMinutes: 'estimated_minutes',
  materialsCost: 'materials_cost',
  status: 'status',
};

/**
 * Actualiza la cotización y, si vienen `items`, reemplaza el detalle completo.
 *
 * El reemplazo es a propósito: el frontend manda la lista final tras los
 * ajustes de la HU15 (líneas quitadas, cantidades corregidas, insumos
 * añadidos a mano), y reconciliar línea por línea no aporta nada aquí.
 *
 * Una cotización ya consumida no se toca: sus líneas son el registro de lo
 * que efectivamente se descontó del inventario.
 */
async function update(id, userId, fields, items) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const sets = [];
    const params = [];
    for (const [key, column] of Object.entries(EDITABLE)) {
      if (fields[key] === undefined) continue;
      params.push(fields[key]);
      sets.push(`${column} = $${params.length}`);
    }

    let quote;
    if (sets.length > 0) {
      sets.push('updated_at = now()');
      params.push(id, userId);
      const { rows } = await client.query(
        `UPDATE quotes SET ${sets.join(', ')}
          WHERE id = $${params.length - 1} AND user_id = $${params.length}
            AND consumed_at IS NULL
          RETURNING ${FIELDS}`,
        params
      );
      quote = rows[0] ?? null;
    } else {
      const { rows } = await client.query(
        `SELECT ${FIELDS} FROM quotes
          WHERE id = $1 AND user_id = $2 AND consumed_at IS NULL`,
        [id, userId]
      );
      quote = rows[0] ?? null;
    }

    if (!quote) {
      await client.query('ROLLBACK');
      return null;
    }

    if (items) {
      await client.query('DELETE FROM quote_items WHERE quote_id = $1', [id]);
      await insertItems(id, items, client);
    }

    await client.query('COMMIT');
    return findByIdForUser(id, userId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Una cotización que ya descontó stock no se borra: es el registro de ese
 * descuento, y sin ella otra cotización del mismo proyecto podría descontar de
 * nuevo. La condición va en el mismo DELETE, así que un descuento simultáneo
 * (que bloquea la fila) no se cuela entre la comprobación y el borrado.
 */
async function remove(id, userId) {
  const { rows } = await pool.query(
    'DELETE FROM quotes WHERE id = $1 AND user_id = $2 AND consumed_at IS NULL RETURNING id',
    [id, userId]
  );
  return rows[0] ?? null;
}

/**
 * HU16: descuenta del inventario todo lo que consume esta cotización. Lo pide
 * el artista desde la cotización guardada; completar una sesión no lo hace.
 *
 * **Nunca deja el stock incompleto ni negativo**: si a algún insumo no le
 * alcanza, no se descuenta nada y se devuelven los faltantes, para que el
 * artista reponga y vuelva a intentarlo. Los insumos se bloquean (FOR UPDATE)
 * antes de comparar, así un ajuste simultáneo no cuela un descuento de más.
 *
 * El sello `consumed_at` se pone con un UPDATE condicionado a que siga nulo:
 * dos clics o dos pestañas no descuentan dos veces.
 *
 * **Un solo descuento por proyecto:** un proyecto puede tener varias
 * cotizaciones (variantes de tamaño o color), pero el tatuaje se hace una vez.
 * Si otra cotización del mismo proyecto ya descontó, esta no lo hace. Un
 * candado por proyecto evita que dos descuentos simultáneos pasen los dos.
 *
 * Se descuenta `round(quantity)` porque `materials.quantity` va en enteros.
 * Los insumos que rinden muchas sesiones (medio rollo de film) quedan bajo 0,5
 * y no se tocan. Las líneas sin insumo (tinta «por comprar», o un insumo que
 * se borró del inventario) no descuentan ni bloquean.
 *
 * @returns {null} si la cotización no existe, no es suya o ya se consumió
 * @returns {{ alreadyConsumed: { id, title } }} si otra cotización del proyecto ya descontó
 * @returns {{ shortages }} si falta stock (no se descontó nada)
 * @returns {{ quote, affected }} con lo descontado y si quedó en nivel crítico
 */
async function consume(id, userId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: marked } = await client.query(
      `UPDATE quotes SET consumed_at = now(), updated_at = now()
        WHERE id = $1 AND user_id = $2 AND consumed_at IS NULL
        RETURNING ${FIELDS}`,
      [id, userId]
    );
    if (!marked[0]) {
      await client.query('ROLLBACK');
      return null;
    }

    const projectId = marked[0].project_id;
    if (projectId) {
      await client.query("SELECT pg_advisory_xact_lock(hashtext('quote-consume:' || $1))", [
        projectId,
      ]);
      const { rows: done } = await client.query(
        `SELECT id, title FROM quotes
          WHERE project_id = $1 AND user_id = $2 AND id <> $3 AND consumed_at IS NOT NULL
          ORDER BY consumed_at
          LIMIT 1`,
        [projectId, userId, id]
      );
      if (done[0]) {
        await client.query('ROLLBACK');
        return { alreadyConsumed: done[0] };
      }
    }

    // Solo insumos vivos (`material_id` no nulo) y del mismo dueño.
    const { rows: needed } = await client.query(
      `SELECT m.id, m.name, m.unit, m.quantity, m.min_quantity, c.used
         FROM materials m
         JOIN (SELECT material_id, round(sum(quantity))::int AS used
                 FROM quote_items
                WHERE quote_id = $1 AND material_id IS NOT NULL
                GROUP BY material_id
               HAVING round(sum(quantity))::int > 0) c ON c.material_id = m.id
        WHERE m.user_id = $2
        ORDER BY m.id
        FOR UPDATE OF m`,
      [id, userId]
    );

    const shortages = needed
      .filter((m) => m.quantity < m.used)
      .map((m) => ({
        id: m.id,
        name: m.name,
        unit: m.unit,
        needed: m.used,
        available: m.quantity,
        missing: m.used - m.quantity,
      }));
    if (shortages.length) {
      // Se deshace también el sello: la cotización queda como estaba.
      await client.query('ROLLBACK');
      return { shortages };
    }

    const { rows: affected } = await client.query(
      `UPDATE materials m
          SET quantity = m.quantity - c.used, updated_at = now()
         FROM (SELECT * FROM unnest($2::uuid[], $3::int[]) AS t(material_id, used)) c
        WHERE m.id = c.material_id AND m.user_id = $1
        RETURNING m.id, m.name, m.unit, m.quantity, m.min_quantity,
                  c.used AS discounted`,
      [userId, needed.map((m) => m.id), needed.map((m) => m.used)]
    );

    await client.query('COMMIT');
    return {
      quote: await findByIdForUser(id, userId),
      // HU13 se engancha aquí: tras descontar, lo que quedó en nivel crítico
      // es exactamente lo que hay que salir a reponer.
      affected: affected.map((m) => ({ ...m, low: m.quantity <= m.min_quantity })),
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  listByUser,
  findByIdForUser,
  findBySession,
  create,
  update,
  remove,
  consume,
};
