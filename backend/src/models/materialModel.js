const pool = require('../config/db');
const { DEFAULT_MATERIALS } = require('../data/defaultMaterials');

const COLUMNS = `
  id, user_id, name, category, unit, quantity, min_quantity, unit_cost,
  supplier, notes, consumption_basis, consumption_rate, color_hex, created_at, updated_at
`;

// Mismo tope de cordura que valida el controlador: sumar stock nunca lo pasa.
const MAX_QUANTITY = 1000000;

// Un insumo está en nivel crítico cuando su stock llegó al mínimo definido.
const LOW_STOCK = 'quantity <= min_quantity';

/**
 * Inventario del artista. Los insumos en nivel crítico salen primero: es lo
 * que hay que reponer.
 */
async function listByUser(userId, { category, q, low } = {}) {
  const params = [userId];
  let sql = `SELECT ${COLUMNS} FROM materials WHERE user_id = $1`;

  if (category) {
    params.push(category);
    sql += ` AND category = $${params.length}`;
  }
  if (q) {
    // Se escapan los comodines de LIKE para que "50%" se busque literal.
    params.push(`%${q.replace(/[\\%_]/g, '\\$&')}%`);
    sql += ` AND (name ILIKE $${params.length} OR supplier ILIKE $${params.length})`;
  }
  if (low) sql += ` AND ${LOW_STOCK}`;

  sql += ` ORDER BY (${LOW_STOCK}) DESC, lower(name)`;

  const { rows } = await pool.query(sql, params);
  return rows;
}

async function findByIdForUser(id, userId) {
  const { rows } = await pool.query(
    `SELECT ${COLUMNS} FROM materials WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  return rows[0] ?? null;
}

async function create(data, db = pool) {
  const { rows } = await db.query(
    `INSERT INTO materials
       (user_id, name, category, unit, quantity, min_quantity, unit_cost, supplier,
        notes, consumption_basis, consumption_rate, color_hex)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING ${COLUMNS}`,
    [
      data.userId,
      data.name,
      data.category ?? 'otros',
      data.unit ?? 'unidad',
      data.quantity ?? 0,
      data.minQuantity ?? 0,
      data.unitCost ?? 0,
      data.supplier ?? null,
      data.notes ?? null,
      data.consumptionBasis ?? 'ninguno',
      data.consumptionRate ?? 0,
      data.colorHex ?? null,
    ]
  );
  return rows[0];
}

/**
 * Alta desde «Agregar al inventario». Si el artista ya tiene un insumo con el
 * mismo nombre (sin distinguir mayúsculas ni espacios), no se duplica: la
 * cantidad se **suma** a su stock y el resto de los datos (costo, mínimo, regla
 * de consumo…) se actualiza con lo que trae el formulario. Si no existe, se crea.
 *
 * Va en una transacción con un candado por artista para que dos altas
 * simultáneas del mismo insumo no terminen creando dos filas.
 *
 * @returns {{ material: object, merged: boolean }}
 */
async function createOrMerge(data) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('materials:' || $1))", [
      data.userId,
    ]);

    const { rows: found } = await client.query(
      `SELECT id FROM materials
        WHERE user_id = $1 AND lower(btrim(name)) = lower(btrim($2))
        ORDER BY created_at
        LIMIT 1`,
      [data.userId, data.name]
    );

    let material;
    let merged = false;
    if (found[0]) {
      merged = true;
      const { rows } = await client.query(
        `UPDATE materials
            SET quantity = LEAST($3, quantity + $4),
                category = COALESCE($5, category),
                unit = COALESCE($6, unit),
                min_quantity = COALESCE($7, min_quantity),
                unit_cost = COALESCE($8, unit_cost),
                consumption_basis = COALESCE($9, consumption_basis),
                consumption_rate = COALESCE($10, consumption_rate),
                color_hex = CASE WHEN $11::boolean THEN $12 ELSE color_hex END,
                supplier = CASE WHEN $13::boolean THEN $14 ELSE supplier END,
                notes = CASE WHEN $15::boolean THEN $16 ELSE notes END,
                updated_at = now()
          WHERE id = $1 AND user_id = $2
          RETURNING ${COLUMNS}`,
        [
          found[0].id,
          data.userId,
          MAX_QUANTITY,
          data.quantity ?? 0,
          data.category ?? null,
          data.unit ?? null,
          data.minQuantity ?? null,
          data.unitCost ?? null,
          data.consumptionBasis ?? null,
          data.consumptionRate ?? null,
          data.colorHex !== undefined,
          data.colorHex ?? null,
          data.supplier !== undefined,
          data.supplier ?? null,
          data.notes !== undefined,
          data.notes ?? null,
        ]
      );
      material = rows[0];
    } else {
      material = await create(data, client);
    }

    await client.query('COMMIT');
    return { material, merged };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// Solo estos campos son editables; la lista evita inyección al construir el SET.
const EDITABLE = {
  name: 'name',
  category: 'category',
  unit: 'unit',
  quantity: 'quantity',
  minQuantity: 'min_quantity',
  unitCost: 'unit_cost',
  supplier: 'supplier',
  notes: 'notes',
  consumptionBasis: 'consumption_basis',
  consumptionRate: 'consumption_rate',
  colorHex: 'color_hex',
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
    `UPDATE materials SET ${sets.join(', ')}
      WHERE id = $${params.length - 1} AND user_id = $${params.length}
      RETURNING ${COLUMNS}`,
    params
  );
  return rows[0] ?? null;
}

/**
 * Suma `delta` al stock (negativo para descontar consumo). Se resuelve en la
 * base con GREATEST para que dos ajustes seguidos no se pisen y el stock nunca
 * quede bajo cero.
 */
async function adjustStock(id, userId, delta) {
  const { rows } = await pool.query(
    `UPDATE materials
        SET quantity = GREATEST(0, quantity + $3), updated_at = now()
      WHERE id = $1 AND user_id = $2
      RETURNING ${COLUMNS}`,
    [id, userId, delta]
  );
  return rows[0] ?? null;
}

async function remove(id, userId) {
  const { rows } = await pool.query(
    'DELETE FROM materials WHERE id = $1 AND user_id = $2 RETURNING id',
    [id, userId]
  );
  return rows[0] ?? null;
}

/**
 * Carga el kit básico (`data/defaultMaterials.js`) en el inventario del artista.
 *
 * Solo agrega lo que no tiene: se compara el nombre sin distinguir mayúsculas,
 * así que pedirlo dos veces, o pedirlo con un inventario a medias, no duplica
 * nada ni pisa lo que el artista ya ajustó. Va en una sola consulta, no una por
 * insumo: son treinta y esto corre dentro del registro de una cuenta.
 *
 * @returns los insumos que se crearon (los que ya existían no salen)
 */
async function createDefaults(userId, db = pool) {
  const col = (pick) => DEFAULT_MATERIALS.map(pick);
  const { rows } = await db.query(
    `INSERT INTO materials
       (user_id, name, category, unit, quantity, min_quantity, unit_cost,
        consumption_basis, consumption_rate, color_hex, notes)
     SELECT $1, d.name, d.category, d.unit, d.quantity, d.min_quantity, d.unit_cost,
            d.basis, d.rate, d.color, d.notes
       FROM unnest($2::text[], $3::text[], $4::text[], $5::int[], $6::int[],
                   $7::int[], $8::text[], $9::numeric[], $10::text[], $11::text[])
            AS d(name, category, unit, quantity, min_quantity, unit_cost, basis, rate, color, notes)
      WHERE NOT EXISTS (
        SELECT 1 FROM materials m
         WHERE m.user_id = $1 AND lower(m.name) = lower(d.name)
      )
     RETURNING ${COLUMNS}`,
    [
      userId,
      col((m) => m.name),
      col((m) => m.category),
      col((m) => m.unit),
      col((m) => m.quantity),
      col((m) => m.minQuantity),
      col((m) => m.unitCost),
      col((m) => m.consumptionBasis),
      col((m) => m.consumptionRate),
      col((m) => m.colorHex),
      col((m) => m.notes),
    ]
  );
  return rows;
}

/**
 * Le ofrece el catálogo al artista **una sola vez**: la primera que entra a su
 * inventario o a las cotizaciones.
 *
 * La marca `materials_seeded_at` se sella con un UPDATE condicional, así que dos
 * peticiones simultáneas (el inventario y las cotizaciones se piden juntas al
 * abrir la app) no siembran dos veces: solo la que logra el UPDATE sigue. Marca y
 * carga van en una transacción, para que un fallo a medias no deje la marca
 * puesta sin insumos.
 *
 * Solo siembra si el inventario está vacío. Quien ya armó el suyo a mano (las
 * cuentas anteriores a esta función) conserva exactamente lo que tiene, y a esas
 * se les marca de todos modos para no preguntar de nuevo.
 *
 * @returns cuántos insumos se cargaron (0 casi siempre: ya estaba hecho)
 */
async function ensureStarterKit(userId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const claimed = await client.query(
      `UPDATE users SET materials_seeded_at = now()
        WHERE id = $1 AND materials_seeded_at IS NULL`,
      [userId]
    );
    let created = 0;
    if (claimed.rowCount > 0) {
      const { rows } = await client.query(
        'SELECT 1 FROM materials WHERE user_id = $1 LIMIT 1',
        [userId]
      );
      if (rows.length === 0) created = (await createDefaults(userId, client)).length;
    }
    await client.query('COMMIT');
    return created;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Vacía el inventario del artista. Las cotizaciones guardadas no se pierden:
 * `quote_items.material_id` pasa a NULL y la línea conserva su nombre, unidad y
 * costo; solo deja de poder descontar stock de un insumo que ya no existe.
 *
 * @returns cuántos insumos se eliminaron
 */
async function removeAll(userId) {
  const { rowCount } = await pool.query('DELETE FROM materials WHERE user_id = $1', [userId]);
  return rowCount;
}

/**
 * Insumos que entran en una cotización (HU14): los que declararon cómo se
 * consumen. La máquina o el pedal quedan fuera — no se gastan tatuando.
 */
async function listConsumable(userId) {
  const { rows } = await pool.query(
    `SELECT ${COLUMNS} FROM materials
      WHERE user_id = $1 AND consumption_basis <> 'ninguno' AND consumption_rate > 0
      ORDER BY lower(name)`,
    [userId]
  );
  return rows;
}

module.exports = {
  listByUser,
  listConsumable,
  findByIdForUser,
  create,
  createOrMerge,
  createDefaults,
  ensureStarterKit,
  update,
  adjustStock,
  remove,
  removeAll,
};
