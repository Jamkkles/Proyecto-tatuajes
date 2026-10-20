const clientModel = require('../models/clientModel');
const projectModel = require('../models/projectModel');
const photoModel = require('../models/sessionPhotoModel');
const { removeFiles } = require('../services/storage/removeFiles');
const {
  FieldError,
  isUuid,
  optionalText,
  requiredText,
  sendError,
} = require('../utils/fields');

const NOT_FOUND = { message: 'Cliente no encontrado.' };

// Permisivo a propósito: +56 9 1234 5678, (2) 2345 6789, 912345678…
// El formato estricto E.164 lo exigirá el envío por WhatsApp (HU22).
const PHONE_RE = /^\+?[\d\s().-]{6,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Valida los datos de contacto. En un PATCH (`partial`) todo es opcional. */
function parseClient(body, { partial }) {
  const fields = {};

  if (!partial || body.name !== undefined) {
    fields.name = requiredText(body.name, 'El nombre', 120);
  }

  const phone = optionalText(body.phone, 'El teléfono', 30);
  if (phone && !PHONE_RE.test(phone)) {
    throw new FieldError('El teléfono no tiene un formato válido.');
  }
  const email = optionalText(body.email, 'El correo', 160);
  if (email && !EMAIL_RE.test(email)) {
    throw new FieldError('El correo no tiene un formato válido.');
  }
  // Se guarda sin la @ para que buscar "camila.tattoo" encuentre "@camila.tattoo".
  const instagram = optionalText(body.instagram, 'El Instagram', 60);

  fields.phone = phone;
  fields.email = email;
  fields.instagram = instagram === undefined || instagram === null
    ? instagram
    : instagram.replace(/^@+/, '') || null;
  fields.notes = optionalText(body.notes, 'Las notas', 2000);

  return fields;
}

// GET /api/clients?q=
async function list(req, res) {
  const q = String(req.query.q ?? '').trim().slice(0, 100) || undefined;
  try {
    const clients = await clientModel.listByUser(req.user.sub, { q });
    return res.json({ clients });
  } catch (err) {
    return sendError(res, err, 'listando clientes');
  }
}

// GET /api/clients/:id  → ficha del cliente con su historial de proyectos (HU24)
async function get(req, res) {
  if (!isUuid(req.params.id)) return res.status(404).json(NOT_FOUND);

  try {
    const client = await clientModel.findByIdForUser(req.params.id, req.user.sub);
    if (!client) return res.status(404).json(NOT_FOUND);

    const projects = await projectModel.listByUser(req.user.sub, { clientId: client.id });
    return res.json({ client, projects });
  } catch (err) {
    return sendError(res, err, 'obteniendo el cliente');
  }
}

// POST /api/clients
async function create(req, res) {
  try {
    const fields = parseClient(req.body ?? {}, { partial: false });
    const client = await clientModel.create({ userId: req.user.sub, ...fields });
    return res.status(201).json({ client });
  } catch (err) {
    return sendError(res, err, 'creando el cliente');
  }
}

// PATCH /api/clients/:id
async function update(req, res) {
  if (!isUuid(req.params.id)) return res.status(404).json(NOT_FOUND);

  try {
    const fields = parseClient(req.body ?? {}, { partial: true });
    const client = await clientModel.update(req.params.id, req.user.sub, fields);
    if (!client) return res.status(404).json(NOT_FOUND);
    return res.json({ client });
  } catch (err) {
    return sendError(res, err, 'actualizando el cliente');
  }
}

// DELETE /api/clients/:id  → borra también sus proyectos, sesiones y fotos
async function remove(req, res) {
  if (!isUuid(req.params.id)) return res.status(404).json(NOT_FOUND);

  try {
    const files = await photoModel.filesFor('client', req.params.id, req.user.sub);
    const deleted = await clientModel.remove(req.params.id, req.user.sub);
    if (!deleted) return res.status(404).json(NOT_FOUND);

    await removeFiles(files);
    return res.status(204).end();
  } catch (err) {
    return sendError(res, err, 'eliminando el cliente');
  }
}

module.exports = { list, get, create, update, remove };
