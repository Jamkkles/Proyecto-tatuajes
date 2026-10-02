const quoteModel = require('../models/quoteModel');
const materialModel = require('../models/materialModel');
const projectModel = require('../models/projectModel');
const sketchModel = require('../models/sketchModel');
const {
  computeQuote,
  itemsCost,
  STROKES,
  COLOR_MODES,
  COBERTURA_POR_DEFECTO,
} = require('../services/quoteEngine');
const {
  FieldError,
  decimal,
  integerBetween,
  isUuid,
  money,
  oneOf,
  optionalUuid,
  requiredText,
  sendError,
} = require('../utils/fields');

const VALID_STATUS = ['borrador', 'aceptada', 'descartada'];
// Violación de restricción única en Postgres. Solo hay una posible en
// `quotes`: el índice que deja una cotización por sesión.
const PG_UNIQUE_VIOLATION = '23505';
const VALID_ITEM_SOURCE = ['calculado', 'manual'];
const NOT_FOUND = { message: 'Cotización no encontrada.' };

// Un tatuaje de más de 2 m no existe; el tope evita que un dedazo en el
// formulario dispare un cálculo absurdo.
const MAX_CM = 200;
const MAX_SESSIONS = 50;
// Tope por línea: 100.000 unidades de un insumo cubre hasta los mililitros.
const MAX_ITEM_QUANTITY = 100000;

/**
 * Valida que las referencias del cuerpo sean filas del propio artista.
 *
 * La clave foránea solo garantiza que la fila exista; sin esto, alguien podría
 * colgar su cotización del proyecto de otro. Igual que en la agenda, una
 * referencia ajena da 400 y no 404: no se confirma que ese id exista.
 */
async function assertRefs(userId, { projectId, sketchId, sessionId }) {
  const checks = [
    ['project', projectId, 'El proyecto no existe o no es tuyo.'],
    ['sketch', sketchId, 'El boceto no existe o no es tuyo.'],
    ['session', sessionId, 'La sesión no existe o no es tuya.'],
  ];

  for (const [kind, id, message] of checks) {
    if (!id) continue;
    if (!(await projectModel.ownsReference(kind, id, userId))) throw new FieldError(message);
  }
}

/**
 * Enlazar dos cotizaciones a la misma sesión choca contra `quotes_session_idx`.
 * Es una acción razonable del artista (querer recotizar una cita), así que
 * merece un mensaje claro y no el 500 genérico de un error de base de datos.
 */
function sendQuoteError(res, err, action) {
  if (err?.code === PG_UNIQUE_VIOLATION) {
    return res
      .status(409)
      .json({ message: 'Esa sesión ya tiene una cotización. Edítala o quítale el enlace.' });
  }
  return sendError(res, err, action);
}

/** Parámetros del cálculo, comunes a la estimación y al guardado. */
function parseParams(body, { partial }) {
  const fields = {
    widthCm: decimal(body.widthCm, 0.1, MAX_CM, `El ancho debe ir entre 0,1 y ${MAX_CM} cm.`),
    heightCm: decimal(body.heightCm, 0.1, MAX_CM, `El alto debe ir entre 0,1 y ${MAX_CM} cm.`),
    inkRatio: decimal(body.inkRatio, 0.001, 1, 'La cobertura de tinta debe ir entre 0,1% y 100%.'),
    stroke: oneOf(body.stroke, STROKES, 'Grosor de trazo no válido.'),
    colorMode: oneOf(body.colorMode, COLOR_MODES, 'Modo de color no válido.'),
    sessionsCount: integerBetween(
      body.sessionsCount,
      1,
      MAX_SESSIONS,
      `Las sesiones deben ir entre 1 y ${MAX_SESSIONS}.`
    ),
  };

  if (!partial) {
    if (fields.widthCm === undefined || fields.heightCm === undefined) {
      throw new FieldError('Indica el ancho y el alto del tatuaje en centímetros.');
    }
  }
  return fields;
}

/**
 * Líneas de insumos enviadas por el artista (HU15).
 *
 * El frontend manda la lista final tras sus ajustes. Cada línea viaja con su
 * nombre, unidad y costo: son la copia congelada que queda en la cotización,
 * no una referencia al insumo actual.
 */
function parseItems(raw) {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) throw new FieldError('El detalle de insumos no es válido.');
  if (raw.length > 100) throw new FieldError('Demasiadas líneas en la cotización.');

  return raw.map((item) => {
    const quantityError = 'La cantidad de cada línea debe ser mayor que cero.';
    // `decimal` deja pasar undefined (así funcionan los campos opcionales en
    // un PATCH), pero aquí la cantidad es lo que da sentido a la línea: sin
    // ella el INSERT rompería con un 500 en vez de decir qué falta.
    const quantity = decimal(item?.quantity, 0.001, MAX_ITEM_QUANTITY, quantityError);
    if (quantity === undefined) throw new FieldError(quantityError);

    return {
      materialId: optionalUuid(item?.materialId, 'Insumo no válido.') ?? null,
      name: requiredText(item?.name, 'El nombre del insumo', 120),
      unit: requiredText(item?.unit, 'La unidad del insumo', 20),
      quantity,
      unitCost: money(item?.unitCost, 'El costo unitario') ?? 0,
      source: oneOf(item?.source, VALID_ITEM_SOURCE, 'Origen de la línea no válido.') ?? 'manual',
    };
  });
}

/**
 * POST /api/quotes/estimate  → calcula sin guardar (HU14)
 *
 * Es la ruta que usa la calculadora mientras el artista mueve los
 * deslizadores: devuelve el detalle de insumos y el costo, pero no toca la
 * base. Guardar es un paso aparte y explícito.
 */
async function estimate(req, res) {
  try {
    const body = req.body ?? {};
    const params = parseParams(body, { partial: false });

    // La cobertura sale del boceto si hay uno enlazado y el artista no la
    // corrigió a mano. Los bocetos subidos antes de esta iteración no la
    // tienen medida: ahí entra el valor por defecto.
    const sketchId = optionalUuid(body.sketchId, 'El boceto no es válido.');
    const sketch = sketchId ? await sketchModel.findByIdForUser(sketchId, req.user.sub) : null;

    // La cobertura y la paleta salen del boceto enlazado; el artista puede
    // corregir la cobertura a mano. Los bocetos subidos antes de medirlas no
    // las tienen: ahí entra el valor por defecto y se cotiza sin reparto de
    // color, como antes.
    const inkRatio =
      params.inkRatio ?? (sketch?.ink_ratio ? Number(sketch.ink_ratio) : COBERTURA_POR_DEFECTO);

    // Se le pasa el inventario completo, no solo lo que tiene regla de consumo:
    // el motor ya descarta por su cuenta lo que no se gasta, y así el
    // emparejamiento de color ve TODAS las tintas del artista. Si no, una tinta
    // con color pero sin tasa quedaría invisible y su color saldría reportado
    // como "no tienes esta tinta", que es falso: la tiene, lo que falta es
    // decirle al sistema cuánto se gasta.
    const materials = await materialModel.listByUser(req.user.sub);
    const result = computeQuote({
      ...params,
      inkRatio,
      stroke: params.stroke ?? 'medio',
      colorMode: params.colorMode ?? 'negro',
      // Sin valor, el motor deduce las sesiones del trabajo que pide la pieza.
      sessionsCount: params.sessionsCount,
      materials,
      palette: sketch?.palette ?? null,
    });

    return res.json({
      estimate: { ...result, inkRatio },
      // Sin insumos con regla de consumo el cálculo da cero y parecería un
      // error del sistema; conviene que el frontend pueda decir por qué.
      consumableCount: materials.filter(
        (m) => m.consumption_basis !== 'ninguno' && Number(m.consumption_rate) > 0
      ).length,
    });
  } catch (err) {
    return sendError(res, err, 'calculando la cotización');
  }
}

// GET /api/quotes?projectId=
async function list(req, res) {
  const projectId = req.query.projectId;
  if (projectId !== undefined && !isUuid(projectId)) {
    return res.status(400).json({ message: 'El proyecto no es válido.' });
  }

  try {
    const quotes = await quoteModel.listByUser(req.user.sub, { projectId });
    return res.json({ quotes });
  } catch (err) {
    return sendError(res, err, 'listando cotizaciones');
  }
}

// GET /api/quotes/:id
async function get(req, res) {
  if (!isUuid(req.params.id)) return res.status(404).json(NOT_FOUND);

  try {
    const quote = await quoteModel.findByIdForUser(req.params.id, req.user.sub);
    if (!quote) return res.status(404).json(NOT_FOUND);
    return res.json({ quote });
  } catch (err) {
    return sendError(res, err, 'obteniendo la cotización');
  }
}

// POST /api/quotes  → guarda la cotización con su detalle (HU14 + HU15)
async function create(req, res) {
  const body = req.body ?? {};

  try {
    const params = parseParams(body, { partial: false });
    const refs = {
      projectId: optionalUuid(body.projectId, 'El proyecto no es válido.') ?? null,
      sketchId: optionalUuid(body.sketchId, 'El boceto no es válido.') ?? null,
      sessionId: optionalUuid(body.sessionId, 'La sesión no es válida.') ?? null,
    };
    await assertRefs(req.user.sub, refs);

    const sketch = refs.sketchId
      ? await sketchModel.findByIdForUser(refs.sketchId, req.user.sub)
      : null;
    const inkRatio =
      params.inkRatio ?? (sketch?.ink_ratio ? Number(sketch.ink_ratio) : COBERTURA_POR_DEFECTO);

    const stroke = params.stroke ?? 'medio';
    const colorMode = params.colorMode ?? 'negro';

    // Si el artista mandó su propio detalle (ya ajustado en la calculadora) se
    // respeta tal cual; el costo se recalcula igual en el servidor, para que
    // no dependa de lo que diga el cliente.
    let items = parseItems(body.items);
    let estimatedMinutes = integerBetween(
      body.estimatedMinutes,
      0,
      100000,
      'La duración estimada no es válida.'
    );
    // Las sesiones son un resultado del cálculo, no un dato que haya que pedir:
    // salen del trabajo que exige la pieza. El artista puede fijarlas si ya las
    // acordó con el cliente.
    let sessionsCount = params.sessionsCount;

    if (items === undefined || estimatedMinutes === undefined || sessionsCount === undefined) {
      // Se le pasa el inventario completo, no solo lo que tiene regla de
      // consumo: el motor ya descarta por su cuenta lo que no se gasta, y así
      // el emparejamiento de color ve TODAS las tintas del artista. Si no, una
      // tinta con color pero sin tasa quedaría invisible y su color saldría
      // reportado como "no tienes esta tinta", que es falso: la tiene, lo que
      // falta es decirle al sistema cuánto se gasta.
      const materials = await materialModel.listByUser(req.user.sub);
      const computed = computeQuote({
        widthCm: params.widthCm,
        heightCm: params.heightCm,
        inkRatio,
        stroke,
        colorMode,
        sessionsCount,
        materials,
        palette: sketch?.palette ?? null,
      });
      if (items === undefined) items = computed.items;
      if (estimatedMinutes === undefined) estimatedMinutes = computed.estimatedMinutes;
      if (sessionsCount === undefined) sessionsCount = computed.sessionsCount;
    }

    const quote = await quoteModel.create({
      userId: req.user.sub,
      ...refs,
      title: requiredText(body.title, 'El título de la cotización', 120),
      widthCm: params.widthCm,
      heightCm: params.heightCm,
      inkRatio,
      stroke,
      colorMode,
      sessionsCount,
      estimatedMinutes,
      materialsCost: itemsCost(items),
      status: oneOf(body.status, VALID_STATUS, 'Estado no válido.') ?? 'borrador',
      items,
    });

    return res.status(201).json({ quote });
  } catch (err) {
    return sendQuoteError(res, err, 'creando la cotización');
  }
}

// PATCH /api/quotes/:id  → ajustar parámetros o el detalle de insumos (HU15)
async function update(req, res) {
  if (!isUuid(req.params.id)) return res.status(404).json(NOT_FOUND);
  const body = req.body ?? {};

  try {
    const fields = parseParams(body, { partial: true });

    if (body.title !== undefined) {
      fields.title = requiredText(body.title, 'El título de la cotización', 120);
    }
    fields.status = oneOf(body.status, VALID_STATUS, 'Estado no válido.');
    fields.estimatedMinutes = integerBetween(
      body.estimatedMinutes,
      0,
      100000,
      'La duración estimada no es válida.'
    );

    for (const key of ['projectId', 'sketchId', 'sessionId']) {
      if (body[key] !== undefined) {
        fields[key] = optionalUuid(body[key], 'La referencia no es válida.');
      }
    }
    await assertRefs(req.user.sub, fields);

    const items = parseItems(body.items);
    // El costo lo fija siempre el servidor a partir de las líneas: es la
    // cifra que se le muestra al cliente y no puede venir del navegador.
    if (items) fields.materialsCost = itemsCost(items);

    const quote = await quoteModel.update(req.params.id, req.user.sub, fields, items);
    // El modelo también devuelve null si ya se consumió: entonces es
    // inmutable, porque sus líneas son el registro de lo que se descontó.
    if (!quote) {
      const exists = await quoteModel.findByIdForUser(req.params.id, req.user.sub);
      if (exists) {
        return res
          .status(409)
          .json({ message: 'La cotización ya descontó el stock y no se puede modificar.' });
      }
      return res.status(404).json(NOT_FOUND);
    }
    return res.json({ quote });
  } catch (err) {
    return sendQuoteError(res, err, 'actualizando la cotización');
  }
}

// DELETE /api/quotes/:id
async function remove(req, res) {
  if (!isUuid(req.params.id)) return res.status(404).json(NOT_FOUND);

  try {
    const deleted = await quoteModel.remove(req.params.id, req.user.sub);
    if (!deleted) return res.status(404).json(NOT_FOUND);
    return res.status(204).end();
  } catch (err) {
    return sendError(res, err, 'eliminando la cotización');
  }
}

/**
 * POST /api/quotes/:id/consume  → descuenta el stock (HU16)
 *
 * Normalmente esto lo dispara solo el cierre de la sesión; la ruta existe para
 * el caso en que el artista quiera descontar sin pasar por la agenda.
 */
async function consume(req, res) {
  if (!isUuid(req.params.id)) return res.status(404).json(NOT_FOUND);

  try {
    const result = await quoteModel.consume(req.params.id, req.user.sub);
    if (!result) {
      const exists = await quoteModel.findByIdForUser(req.params.id, req.user.sub);
      if (exists) {
        return res.status(409).json({ message: 'Esta cotización ya descontó el stock.' });
      }
      return res.status(404).json(NOT_FOUND);
    }
    return res.json(result);
  } catch (err) {
    return sendError(res, err, 'descontando el stock');
  }
}

module.exports = { estimate, list, get, create, update, remove, consume };
