const pool = require('../config/db');

const COLUMNS = `
  id, user_id, name, category, unit, quantity, min_quantity, unit_cost,
  supplier, notes, consumption_basis, consumption_rate, color_hex, created_at, updated_at
`;

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

async function create(data) {
  const { rows } = await pool.query(
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
  update,
  adjustStock,
  remove,
};
