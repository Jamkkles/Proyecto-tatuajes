const previewModel = require('../models/previewModel');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_NAME = 120;
const MAX_MODEL_ID = 60;
const MAX_PLACEMENTS = 50;

const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);
const isVec = (v, len) => Array.isArray(v) && v.length === len && v.every(isNumber);

/** Valida un preset de cámara. Devuelve el objeto saneado o null. */
function parseCamera(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'object' || !isVec(raw.position, 3) || !isVec(raw.target, 3)) {
    throw new Error('La cámara no tiene un formato válido.');
  }
  return { position: raw.position, target: raw.target };
}

/**
 * Valida las colocaciones y las devuelve saneadas (solo los campos conocidos:
 * así un cliente no puede inflar el JSONB con basura arbitraria).
 */
function parsePlacements(raw) {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) throw new Error('Las colocaciones deben ser una lista.');
  if (raw.length > MAX_PLACEMENTS) {
    throw new Error(`Una escena admite como máximo ${MAX_PLACEMENTS} tatuajes.`);
  }

  return raw.map((p, i) => {
    const at = `El tatuaje ${i + 1}`;
    if (!p || typeof p !== 'object') throw new Error(`${at} no es válido.`);
    if (typeof p.sketchId !== 'string' || !UUID_RE.test(p.sketchId)) {
      throw new Error(`${at} no referencia un boceto válido.`);
    }
    if (!isVec(p.position, 3)) throw new Error(`${at} no tiene una posición válida.`);
    if (!isVec(p.quaternion, 4)) throw new Error(`${at} no tiene una rotación válida.`);
    if (!isVec(p.size, 3)) throw new Error(`${at} no tiene un tamaño válido.`);

    const anchor =
      p.anchor && typeof p.anchor === 'object'
        ? {
            faceIndex: isNumber(p.anchor.faceIndex) ? p.anchor.faceIndex : null,
            uv: isVec(p.anchor.uv, 2) ? p.anchor.uv : null,
          }
        : null;

    const render = p.render && typeof p.render === 'object' ? p.render : {};

    return {
      sketchId: p.sketchId,
      position: p.position,
      quaternion: p.quaternion,
      size: p.size,
      anchor,
      render: {
        order: isNumber(render.order) ? render.order : i,
        opacity: isNumber(render.opacity) ? Math.min(1, Math.max(0, render.opacity)) : 1,
        flipX: render.flipX === true,
      },
    };
  });
}

/** Rechaza escenas que referencien bocetos que no son del usuario. */
async function assertSketchesOwned(placements, userId) {
  const ids = [...new Set(placements.map((p) => p.sketchId))];
  const owned = await previewModel.ownedSketchIds(ids, userId);
  if (owned.length !== ids.length) {
    const err = new Error('Alguno de los bocetos no existe o no es tuyo.');
    err.status = 400;
    throw err;
  }
}

// GET /api/previews
async function list(req, res) {
  try {
    const previews = await previewModel.listByUser(req.user.sub);
    return res.json({ previews });
  } catch (err) {
    console.error('Error listando previsualizaciones:', err);
    return res.status(500).json({ message: 'Error interno. Inténtalo de nuevo.' });
  }
}

// GET /api/previews/:id
async function get(req, res) {
  // Un id con formato inválido reventaría la query: para el usuario es lo
  // mismo que una escena inexistente.
  if (!UUID_RE.test(req.params.id)) {
    return res.status(404).json({ message: 'Previsualización no encontrada.' });
  }

  try {
    const preview = await previewModel.findByIdForUser(req.params.id, req.user.sub);
    if (!preview) return res.status(404).json({ message: 'Previsualización no encontrada.' });
    return res.json({ preview });
  } catch (err) {
    console.error('Error obteniendo la previsualización:', err);
    return res.status(500).json({ message: 'Error interno. Inténtalo de nuevo.' });
  }
}

// POST /api/previews
async function create(req, res) {
  const { name, modelId } = req.body ?? {};

  if (!name || !String(name).trim()) {
    return res.status(400).json({ message: 'Ponle un nombre a la previsualización.' });
  }
  if (String(name).trim().length > MAX_NAME) {
    return res.status(400).json({ message: `El nombre no puede superar ${MAX_NAME} caracteres.` });
  }
  if (!modelId || !String(modelId).trim() || String(modelId).length > MAX_MODEL_ID) {
    return res.status(400).json({ message: 'Modelo no válido.' });
  }

  let camera;
  let placements;
  try {
    camera = parseCamera(req.body?.camera);
    placements = parsePlacements(req.body?.placements) ?? [];
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }

  try {
    await assertSketchesOwned(placements, req.user.sub);

    const preview = await previewModel.create({
      userId: req.user.sub,
      name: String(name).trim(),
      modelId: String(modelId).trim(),
      camera,
      placements,
    });
    return res.status(201).json({ preview });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ message: err.message });
    console.error('Error creando la previsualización:', err);
    return res.status(500).json({ message: 'Error interno. Inténtalo de nuevo.' });
  }
}

// PATCH /api/previews/:id
async function update(req, res) {
  if (!UUID_RE.test(req.params.id)) {
    return res.status(404).json({ message: 'Previsualización no encontrada.' });
  }

  const { name, modelId } = req.body ?? {};
  const fields = {};

  if (name !== undefined) {
    const trimmed = String(name).trim();
    if (!trimmed) return res.status(400).json({ message: 'El nombre no puede quedar vacío.' });
    if (trimmed.length > MAX_NAME) {
      return res.status(400).json({ message: `El nombre no puede superar ${MAX_NAME} caracteres.` });
    }
    fields.name = trimmed;
  }
  if (modelId !== undefined) {
    const trimmed = String(modelId).trim();
    if (!trimmed || trimmed.length > MAX_MODEL_ID) {
      return res.status(400).json({ message: 'Modelo no válido.' });
    }
    fields.modelId = trimmed;
  }

  try {
    if (req.body?.camera !== undefined) fields.camera = parseCamera(req.body.camera);
    const placements = parsePlacements(req.body?.placements);
    if (placements !== undefined) fields.placements = placements;
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }

  try {
    if (fields.placements) await assertSketchesOwned(fields.placements, req.user.sub);

    const preview = await previewModel.update(req.params.id, req.user.sub, fields);
    if (!preview) return res.status(404).json({ message: 'Previsualización no encontrada.' });
    return res.json({ preview });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ message: err.message });
    console.error('Error actualizando la previsualización:', err);
    return res.status(500).json({ message: 'Error interno. Inténtalo de nuevo.' });
  }
}

// DELETE /api/previews/:id
async function remove(req, res) {
  if (!UUID_RE.test(req.params.id)) {
    return res.status(404).json({ message: 'Previsualización no encontrada.' });
  }

  try {
    const deleted = await previewModel.remove(req.params.id, req.user.sub);
    if (!deleted) return res.status(404).json({ message: 'Previsualización no encontrada.' });
    return res.status(204).end();
  } catch (err) {
    console.error('Error eliminando la previsualización:', err);
    return res.status(500).json({ message: 'Error interno. Inténtalo de nuevo.' });
  }
}

module.exports = { list, get, create, update, remove };
