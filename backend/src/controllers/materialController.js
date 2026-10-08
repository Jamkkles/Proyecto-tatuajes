const materialModel = require('../models/materialModel');
const {
  FieldError,
  decimal,
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
// Cómo escala el gasto del insumo en una cotización (HU14).
const VALID_BASIS = ['area', 'sesion', 'hora', 'ninguno'];
// Tope de cordura de la tasa de consumo. Las tasas por área son centésimas
// (0,015 cartuchos/cm²) y las de hora, decenas (25 ml de jabón); 1000 deja
// margen de sobra sin permitir un número absurdo.
const MAX_RATE = 1000;
// Color de la tinta, para emparejarla con la paleta del boceto (HU14).
const HEX_RE = /^#[0-9a-f]{6}$/i;

// Tope de cordura para el stock (p. ej. mililitros de tinta).
const MAX_QUANTITY = 1000000;
const NOT_FOUND = { message: 'Insumo no encontrado.' };

/** '' o null quitan el color; cualquier otra cosa debe ser un #rrggbb. */
function hexColor(raw) {
  if (raw === undefined) return undefined;
  if (raw === null || raw === '') return null;
  const text = String(raw).trim();
  if (!HEX_RE.test(text)) throw new FieldError('El color debe ir en formato #rrggbb.');
  return text.toLowerCase();
}

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
  fields.consumptionBasis = oneOf(
    body.consumptionBasis,
    VALID_BASIS,
    'Base de consumo no válida.'
  );
  fields.consumptionRate = decimal(
    body.consumptionRate,
    0,
    MAX_RATE,
    'La tasa de consumo debe ser un número de 0 en adelante.'
  );
  fields.colorHex = hexColor(body.colorHex);
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

// POST /api/materials/defaults  → carga el kit básico; no duplica lo que ya hay
async function loadDefaults(req, res) {
  try {
    const materials = await materialModel.createDefaults(req.user.sub);
    return res.status(201).json({ materials, created: materials.length });
  } catch (err) {
    return sendError(res, err, 'cargando los insumos básicos');
  }
}

// DELETE /api/materials?confirm=true  → vacía el inventario del artista
async function removeAll(req, res) {
  // Una llamada sin confirmar no borra nada: vaciar el inventario no se puede
  // deshacer, y un DELETE a la colección es fácil de disparar por error.
  if (req.query.confirm !== 'true') {
    return res
      .status(400)
      .json({ message: 'Para eliminar todo el inventario hay que confirmarlo.' });
  }

  try {
    const deleted = await materialModel.removeAll(req.user.sub);
    return res.json({ deleted });
  } catch (err) {
    return sendError(res, err, 'vaciando el inventario');
  }
}

module.exports = { list, create, loadDefaults, update, adjustStock, remove, removeAll };
