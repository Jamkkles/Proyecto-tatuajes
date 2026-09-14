const projectModel = require('../models/projectModel');
const sessionModel = require('../models/sessionModel');
const photoModel = require('../models/sessionPhotoModel');
const { removeFiles } = require('../services/storage/removeFiles');
const {
  FieldError,
  isUuid,
  money,
  oneOf,
  optionalText,
  optionalUuid,
  requiredText,
  sendError,
} = require('../utils/fields');

const VALID_STATUS = ['activo', 'terminado', 'cancelado'];
const NOT_FOUND = { message: 'Proyecto no encontrado.' };

function parseProject(body, { partial }) {
  const fields = {};
  if (!partial || body.title !== undefined) {
    fields.title = requiredText(body.title, 'El nombre del proyecto', 120);
  }
  fields.description = optionalText(body.description, 'La descripción', 2000);
  fields.bodyZone = optionalText(body.bodyZone, 'La zona del cuerpo', 80);
  fields.totalPrice = money(body.totalPrice, 'El precio total');
  fields.status = oneOf(body.status, VALID_STATUS, 'Estado de proyecto no válido.');
  fields.sketchId = optionalUuid(body.sketchId, 'El boceto no es válido.');
  fields.previewId = optionalUuid(body.previewId, 'La previsualización no es válida.');
  return fields;
}

/** Un proyecto solo puede enlazar bocetos y escenas 3D del mismo artista. */
async function assertReferencesOwned(fields, userId) {
  if (fields.sketchId && !(await projectModel.ownsReference('sketch', fields.sketchId, userId))) {
    throw new FieldError('El boceto no existe o no es tuyo.');
  }
  if (fields.previewId && !(await projectModel.ownsReference('preview', fields.previewId, userId))) {
    throw new FieldError('La previsualización no existe o no es tuya.');
  }
}

// GET /api/projects?clientId=&status=
async function list(req, res) {
  const { clientId, status } = req.query;
  if (clientId !== undefined && !isUuid(clientId)) {
    return res.status(400).json({ message: 'Cliente no válido.' });
  }
  if (status !== undefined && !VALID_STATUS.includes(status)) {
    return res.status(400).json({ message: 'Estado de proyecto no válido.' });
  }

  try {
    const projects = await projectModel.listByUser(req.user.sub, { clientId, status });
    return res.json({ projects });
  } catch (err) {
    return sendError(res, err, 'listando proyectos');
  }
}

// GET /api/projects/:id  → proyecto con todas sus sesiones y fotos
async function get(req, res) {
  if (!isUuid(req.params.id)) return res.status(404).json(NOT_FOUND);

  try {
    const project = await projectModel.findByIdForUser(req.params.id, req.user.sub);
    if (!project) return res.status(404).json(NOT_FOUND);

    const sessions = await sessionModel.listByProject(project.id, req.user.sub);
    return res.json({ project, sessions });
  } catch (err) {
    return sendError(res, err, 'obteniendo el proyecto');
  }
}

// POST /api/projects
async function create(req, res) {
  const body = req.body ?? {};
  if (!isUuid(body.clientId)) {
    return res.status(400).json({ message: 'Elige el cliente del proyecto.' });
  }

  try {
    const fields = parseProject(body, { partial: false });
    await assertReferencesOwned(fields, req.user.sub);

    const project = await projectModel.create({
      userId: req.user.sub,
      clientId: body.clientId,
      ...fields,
    });
    // El cliente no existe o es de otro artista.
    if (!project) return res.status(400).json({ message: 'El cliente no existe o no es tuyo.' });
    return res.status(201).json({ project });
  } catch (err) {
    return sendError(res, err, 'creando el proyecto');
  }
}

// PATCH /api/projects/:id
async function update(req, res) {
  if (!isUuid(req.params.id)) return res.status(404).json(NOT_FOUND);

  try {
    const fields = parseProject(req.body ?? {}, { partial: true });
    await assertReferencesOwned(fields, req.user.sub);

    const project = await projectModel.update(req.params.id, req.user.sub, fields);
    if (!project) return res.status(404).json(NOT_FOUND);
    return res.json({ project });
  } catch (err) {
    return sendError(res, err, 'actualizando el proyecto');
  }
}

// DELETE /api/projects/:id  → borra también sus sesiones y fotos
async function remove(req, res) {
  if (!isUuid(req.params.id)) return res.status(404).json(NOT_FOUND);

  try {
    const files = await photoModel.filesFor('project', req.params.id, req.user.sub);
    const deleted = await projectModel.remove(req.params.id, req.user.sub);
    if (!deleted) return res.status(404).json(NOT_FOUND);

    await removeFiles(files);
    return res.status(204).end();
  } catch (err) {
    return sendError(res, err, 'eliminando el proyecto');
  }
}

module.exports = { list, get, create, update, remove };
