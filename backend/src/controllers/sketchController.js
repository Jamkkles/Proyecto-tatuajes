const multer = require('multer');
const { imageSize } = require('image-size');
const sketchModel = require('../models/sketchModel');
const storage = require('../services/storage');
const { optimizeImage } = require('../services/imageOptimizer');

const MAX_FILE_BYTES = Number(process.env.MAX_UPLOAD_BYTES) || 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const VALID_STATUS = ['disponible', 'reservado', 'tatuado'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// El archivo se recibe en memoria: nunca toca el disco antes de que el driver
// decida dónde guardarlo (disco local o nube).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME.includes(file.mimetype)) {
      return cb(new Error('Formato no permitido. Usa JPG, PNG, WEBP o GIF.'));
    }
    cb(null, true);
  },
});

/**
 * Middleware de subida. Traduce los errores de multer a respuestas JSON
 * con el mismo formato `{ message }` que usa el resto de la API.
 */
function uploadMiddleware(req, res, next) {
  upload.single('image')(req, res, (err) => {
    if (!err) return next();

    if (err.code === 'LIMIT_FILE_SIZE') {
      const mb = (MAX_FILE_BYTES / (1024 * 1024)).toFixed(0);
      return res.status(413).json({ message: `La imagen supera el límite de ${mb} MB.` });
    }
    return res.status(400).json({ message: err.message });
  });
}

/** Acepta tags como array JSON o como texto separado por comas. */
function parseTags(raw) {
  if (raw === undefined || raw === null || raw === '') return [];
  if (Array.isArray(raw)) return raw.map((t) => String(t).trim()).filter(Boolean);

  const text = String(raw).trim();
  if (text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed.map((t) => String(t).trim()).filter(Boolean);
    } catch {
      // Si no es JSON válido cae al split por comas.
    }
  }
  return text.split(',').map((t) => t.trim()).filter(Boolean);
}

/** Lee ancho y alto del buffer. Si el formato no se reconoce, devuelve nulos. */
function readDimensions(buffer) {
  try {
    const { width, height } = imageSize(buffer);
    return { width, height };
  } catch {
    return { width: null, height: null };
  }
}

// GET /api/sketches
async function list(req, res) {
  const { status, tag } = req.query;

  if (status && !VALID_STATUS.includes(status)) {
    return res.status(400).json({ message: 'Estado no válido.' });
  }

  try {
    const sketches = await sketchModel.listByUser(req.user.sub, { status, tag });
    return res.json({ sketches });
  } catch (err) {
    console.error('Error listando bocetos:', err);
    return res.status(500).json({ message: 'Error interno. Inténtalo de nuevo.' });
  }
}

// POST /api/sketches  (multipart/form-data)
async function create(req, res) {
  if (!req.file) {
    return res.status(400).json({ message: 'Debes adjuntar una imagen.' });
  }

  const { title, description, bodyZone, status } = req.body ?? {};
  if (!title || !title.trim()) {
    return res.status(400).json({ message: 'El título es obligatorio.' });
  }
  if (status && !VALID_STATUS.includes(status)) {
    return res.status(400).json({ message: 'Estado no válido.' });
  }

  let optimized;
  try {
    optimized = await optimizeImage(req.file.buffer, req.file.mimetype);
  } catch (err) {
    console.error('Error optimizando la imagen:', err);
    return res.status(400).json({ message: 'La imagen está dañada o no se pudo procesar.' });
  }

  let stored;
  try {
    stored = await storage.save({
      buffer: optimized,
      mimeType: req.file.mimetype,
      userId: req.user.sub,
      originalName: req.file.originalname,
    });
  } catch (err) {
    console.error('Error guardando el archivo:', err);
    return res.status(502).json({ message: 'No pudimos guardar la imagen. Inténtalo de nuevo.' });
  }

  const { width, height } = readDimensions(optimized);

  try {
    const sketch = await sketchModel.create({
      userId: req.user.sub,
      title: title.trim(),
      description: description?.trim() || null,
      bodyZone: bodyZone?.trim() || null,
      status: status || 'disponible',
      tags: parseTags(req.body?.tags),
      storageDriver: storage.name,
      storageKey: stored.key,
      url: stored.url,
      mimeType: req.file.mimetype,
      sizeBytes: optimized.length,
      width,
      height,
    });

    return res.status(201).json({ sketch });
  } catch (err) {
    // El archivo ya se subió pero la fila falló: lo borramos para no dejar
    // huérfanos ocupando espacio en el almacenamiento.
    console.error('Error creando el boceto:', err);
    await storage.remove(stored.key).catch((e) =>
      console.error('No se pudo limpiar el archivo huérfano:', e.message)
    );
    return res.status(500).json({ message: 'Error interno. Inténtalo de nuevo.' });
  }
}

// PATCH /api/sketches/:id  (solo metadatos, no reemplaza la imagen)
async function update(req, res) {
  // Un id con formato inválido reventaría la query de Postgres: para el
  // usuario es lo mismo que un boceto inexistente.
  if (!UUID_RE.test(req.params.id)) {
    return res.status(404).json({ message: 'Boceto no encontrado.' });
  }

  const { title, description, bodyZone, status } = req.body ?? {};

  if (title !== undefined && !String(title).trim()) {
    return res.status(400).json({ message: 'El título no puede quedar vacío.' });
  }
  if (status !== undefined && !VALID_STATUS.includes(status)) {
    return res.status(400).json({ message: 'Estado no válido.' });
  }

  const fields = {};
  if (title !== undefined) fields.title = String(title).trim();
  if (description !== undefined) fields.description = description?.trim() || null;
  if (bodyZone !== undefined) fields.bodyZone = bodyZone?.trim() || null;
  if (status !== undefined) fields.status = status;
  if (req.body?.tags !== undefined) fields.tags = parseTags(req.body.tags);

  try {
    const sketch = await sketchModel.update(req.params.id, req.user.sub, fields);
    if (!sketch) {
      return res.status(404).json({ message: 'Boceto no encontrado.' });
    }
    return res.json({ sketch });
  } catch (err) {
    console.error('Error actualizando el boceto:', err);
    return res.status(500).json({ message: 'Error interno. Inténtalo de nuevo.' });
  }
}

// DELETE /api/sketches/:id
async function remove(req, res) {
  if (!UUID_RE.test(req.params.id)) {
    return res.status(404).json({ message: 'Boceto no encontrado.' });
  }

  try {
    const deleted = await sketchModel.remove(req.params.id, req.user.sub);
    if (!deleted) {
      return res.status(404).json({ message: 'Boceto no encontrado.' });
    }

    // La fila ya no está; si el archivo falla al borrarse solo queda huérfano,
    // no vale la pena devolver un error al usuario.
    // Se usa el driver con el que se subió, no el activo: así los bocetos
    // subidos antes de migrar a la nube se siguen borrando de disco.
    try {
      await storage.getDriver(deleted.storage_driver).remove(deleted.storage_key);
    } catch (err) {
      console.error('No se pudo borrar el archivo:', err.message);
    }

    return res.status(204).end();
  } catch (err) {
    console.error('Error eliminando el boceto:', err);
    return res.status(500).json({ message: 'Error interno. Inténtalo de nuevo.' });
  }
}

module.exports = { list, create, update, remove, uploadMiddleware };
