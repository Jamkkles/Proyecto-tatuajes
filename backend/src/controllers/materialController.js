const materialModel = require('../models/materialModel');
const {
  FieldError,
  integerBetween,
  isUuid,
  money,
  oneOf,
  optionalText,
  requiredText,
  sendError,
} = require('../utils/fields');

const VALID_CATEGORY = [
  'agujas',
  'tintas',
  'proteccion',
  'higiene',
  'papeleria',
  'cuidado',
  'maquinas',
  'otros',
];
const VALID_UNIT = ['unidad', 'caja', 'par', 'ml', 'rollo', 'hoja', 'metro', 'set'];

// Tope de cordura para el stock (p. ej. mililitros de tinta).
const MAX_QUANTITY = 1000000;
const NOT_FOUND = { message: 'Insumo no encontrado.' };

function parseMaterial(body, { partial }) {
  const fields = {};
  if (!partial || body.name !== undefined) {
    fields.name = requiredText(body.name, 'El nombre del insumo', 120);
  }
  fields.category = oneOf(body.category, VALID_CATEGORY, 'Categoría no válida.');
  fields.unit = oneOf(body.unit, VALID_UNIT, 'Unidad no válida.');
  fields.quantity = integerBetween(
    body.quantity,
    0,
    MAX_QUANTITY,
    'La cantidad debe ser un número entero de 0 en adelante.'
  );
  fields.minQuantity = integerBetween(
    body.minQuantity,
    0,
    MAX_QUANTITY,
    'El nivel crítico debe ser un número entero de 0 en adelante.'
  );
  fields.unitCost = money(body.unitCost, 'El costo unitario');
  fields.supplier = optionalText(body.supplier, 'El proveedor', 120);
  fields.notes = optionalText(body.notes, 'Las notas', 2000);
  return fields;
}

// GET /api/materials?category=&q=&low=true
async function list(req, res) {
  const { category } = req.query;
  if (category !== undefined && !VALID_CATEGORY.includes(category)) {
    return res.status(400).json({ message: 'Categoría no válida.' });
  }

  const q = String(req.query.q ?? '').trim().slice(0, 100) || undefined;
  const low = req.query.low === 'true';

  try {
    const materials = await materialModel.listByUser(req.user.sub, { category, q, low });
    return res.json({ materials });
  } catch (err) {
    return sendError(res, err, 'listando el inventario');
  }
}

// POST /api/materials  (HU11)
async function create(req, res) {
  try {
    const fields = parseMaterial(req.body ?? {}, { partial: false });
    const material = await materialModel.create({ userId: req.user.sub, ...fields });
    return res.status(201).json({ material });
  } catch (err) {
    return sendError(res, err, 'creando el insumo');
  }
}

// PATCH /api/materials/:id  (HU12)
async function update(req, res) {
  if (!isUuid(req.params.id)) return res.status(404).json(NOT_FOUND);

  try {
    const fields = parseMaterial(req.body ?? {}, { partial: true });
    const material = await materialModel.update(req.params.id, req.user.sub, fields);
    if (!material) return res.status(404).json(NOT_FOUND);
    return res.json({ material });
  } catch (err) {
    return sendError(res, err, 'actualizando el insumo');
  }
}

// POST /api/materials/:id/stock  { delta }  → sumar o descontar stock (HU12)
async function adjustStock(req, res) {
  if (!isUuid(req.params.id)) return res.status(404).json(NOT_FOUND);

  try {
    const delta = integerBetween(
      req.body?.delta,
      -MAX_QUANTITY,
      MAX_QUANTITY,
      'El ajuste debe ser un número entero.'
    );
    if (delta === undefined || delta === 0) {
      throw new FieldError('Indica cuánto sumar o descontar.');
    }

    const material = await materialModel.adjustStock(req.params.id, req.user.sub, delta);
    if (!material) return res.status(404).json(NOT_FOUND);
    return res.json({ material });
  } catch (err) {
    return sendError(res, err, 'ajustando el stock');
  }
}

// DELETE /api/materials/:id  (HU12: insumos descontinuados)
async function remove(req, res) {
  if (!isUuid(req.params.id)) return res.status(404).json(NOT_FOUND);

  try {
    const deleted = await materialModel.remove(req.params.id, req.user.sub);
    if (!deleted) return res.status(404).json(NOT_FOUND);
    return res.status(204).end();
  } catch (err) {
    return sendError(res, err, 'eliminando el insumo');
  }
}

module.exports = { list, create, update, adjustStock, remove };
