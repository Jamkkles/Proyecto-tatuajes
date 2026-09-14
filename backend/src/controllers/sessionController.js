const sessionModel = require('../models/sessionModel');
const photoModel = require('../models/sessionPhotoModel');
const storage = require('../services/storage');
const { removeFiles } = require('../services/storage/removeFiles');
const { optimizeImage, readDimensions } = require('../services/imageOptimizer');
const {
  FieldError,
  boolean,
  dateTime,
  integerBetween,
  isUuid,
  money,
  oneOf,
  optionalText,
  sendError,
} = require('../utils/fields');

const VALID_STATUS = ['agendada', 'completada', 'cancelada', 'no_asistio'];
const NOT_FOUND = { message: 'Sesión no encontrada.' };
const PHOTO_NOT_FOUND = { message: 'Foto no encontrada.' };

// Un calendario mensual pide ~6 semanas; un año y algo es margen de sobra y
// evita que alguien pida la tabla entera de una vez.
const MAX_RANGE_MS = 400 * 24 * 60 * 60 * 1000;

function parseSession(body, { partial }) {
  const fields = {
    startsAt: dateTime(body.startsAt, 'La fecha y hora de la sesión no son válidas.'),
    durationMinutes: integerBetween(
      body.durationMinutes,
      15,
      1440,
      'La duración debe estar entre 15 minutos y 24 horas.'
    ),
    price: money(body.price, 'El monto de la sesión'),
    paid: boolean(body.paid, 'El estado de pago no es válido.'),
    status: oneOf(body.status, VALID_STATUS, 'Estado de sesión no válido.'),
    notes: optionalText(body.notes, 'Las notas', 2000),
  };
  if (!partial && fields.startsAt === undefined) {
    throw new FieldError('Indica la fecha y hora de la sesión.');
  }
  return fields;
}

// GET /api/sessions?from=&to=  → citas del rango, para el calendario (HU18)
async function list(req, res) {
  const from = new Date(String(req.query.from ?? ''));
  const to = new Date(String(req.query.to ?? ''));

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) {
    return res.status(400).json({ message: 'Indica un rango de fechas válido (from y to).' });
  }
  if (to - from > MAX_RANGE_MS) {
    return res.status(400).json({ message: 'El rango de fechas es demasiado amplio.' });
  }

  try {
    const sessions = await sessionModel.listByUser(req.user.sub, {
      from: from.toISOString(),
      to: to.toISOString(),
    });
    return res.json({ sessions });
  } catch (err) {
    return sendError(res, err, 'listando sesiones');
  }
}

// POST /api/sessions  → agenda una sesión (cita) dentro de un proyecto (HU17)
async function create(req, res) {
  const body = req.body ?? {};
  if (!isUuid(body.projectId)) {
    return res.status(400).json({ message: 'Elige el proyecto de la sesión.' });
  }

  try {
    const fields = parseSession(body, { partial: false });
    const session = await sessionModel.create({
      userId: req.user.sub,
      projectId: body.projectId,
      ...fields,
    });
    if (!session) {
      return res.status(400).json({ message: 'El proyecto no existe o no es tuyo.' });
    }
    return res.status(201).json({ session: { ...session, photos: [] } });
  } catch (err) {
    return sendError(res, err, 'agendando la sesión');
  }
}

// PATCH /api/sessions/:id  → reagendar, cancelar, marcar pagada… (HU21)
async function update(req, res) {
  if (!isUuid(req.params.id)) return res.status(404).json(NOT_FOUND);

  try {
    const fields = parseSession(req.body ?? {}, { partial: true });
    const session = await sessionModel.update(req.params.id, req.user.sub, fields);
    if (!session) return res.status(404).json(NOT_FOUND);
    return res.json({ session });
  } catch (err) {
    return sendError(res, err, 'actualizando la sesión');
  }
}

// DELETE /api/sessions/:id
async function remove(req, res) {
  if (!isUuid(req.params.id)) return res.status(404).json(NOT_FOUND);

  try {
    const files = await photoModel.filesFor('session', req.params.id, req.user.sub);
    const deleted = await sessionModel.remove(req.params.id, req.user.sub);
    if (!deleted) return res.status(404).json(NOT_FOUND);

    await removeFiles(files);
    return res.status(204).end();
  } catch (err) {
    return sendError(res, err, 'eliminando la sesión');
  }
}

// POST /api/sessions/:id/photos  (multipart: image + caption)  → avance (HU20)
async function addPhoto(req, res) {
  if (!isUuid(req.params.id)) return res.status(404).json(NOT_FOUND);
  if (!req.file) return res.status(400).json({ message: 'Debes adjuntar una imagen.' });

  let caption;
  try {
    caption = optionalText(req.body?.caption, 'La descripción de la foto', 300);
    // Se comprueba antes de subir: no tiene sentido gastar almacenamiento en
    // una sesión que no existe o es de otro artista.
    const session = await sessionModel.findByIdForUser(req.params.id, req.user.sub);
    if (!session) return res.status(404).json(NOT_FOUND);
  } catch (err) {
    return sendError(res, err, 'validando la sesión');
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
      folder: 'sessions',
    });
  } catch (err) {
    console.error('Error guardando el archivo:', err);
    return res.status(502).json({ message: 'No pudimos guardar la imagen. Inténtalo de nuevo.' });
  }

  const { width, height } = readDimensions(optimized);

  try {
    const photo = await photoModel.create({
      userId: req.user.sub,
      sessionId: req.params.id,
      caption,
      storageDriver: storage.name,
      storageKey: stored.key,
      url: stored.url,
      mimeType: req.file.mimetype,
      sizeBytes: optimized.length,
      width,
      height,
    });
    // La sesión se borró mientras subía la imagen.
    if (!photo) {
      await removeFiles([{ storage_driver: storage.name, storage_key: stored.key }]);
      return res.status(404).json(NOT_FOUND);
    }
    return res.status(201).json({ photo });
  } catch (err) {
    // El archivo ya se subió pero la fila falló: se borra para no dejar huérfanos.
    await removeFiles([{ storage_driver: storage.name, storage_key: stored.key }]);
    return sendError(res, err, 'registrando la foto');
  }
}

// DELETE /api/sessions/:id/photos/:photoId
async function removePhoto(req, res) {
  if (!isUuid(req.params.id) || !isUuid(req.params.photoId)) {
    return res.status(404).json(PHOTO_NOT_FOUND);
  }

  try {
    const deleted = await photoModel.remove(req.params.photoId, req.params.id, req.user.sub);
    if (!deleted) return res.status(404).json(PHOTO_NOT_FOUND);

    await removeFiles([deleted]);
    return res.status(204).end();
  } catch (err) {
    return sendError(res, err, 'eliminando la foto');
  }
}

module.exports = { list, create, update, remove, addPhoto, removePhoto };
