const bcrypt = require('bcryptjs');
const studioModel = require('../models/studioModel');
const userModel = require('../models/userModel');
const passwordResetModel = require('../models/passwordResetModel');
const accountStatus = require('../services/accountStatus');
const { tempPassword } = require('../utils/tempPassword');
const { FieldError, boolean, isUuid, oneOf, requiredText, sendError } = require('../utils/fields');

/*
 * Administración de la plataforma (HU31–HU36, HU38). Todas las rutas exigen sesión de
 * administrador (`requireAuth` + `requireAdmin`).
 *
 * Las cuentas que crea el administrador reciben una **contraseña temporal** que se
 * devuelve una sola vez, en la respuesta: no se guarda en claro en ninguna parte y no se
 * puede volver a consultar. El administrador se la entrega al tatuador.
 */

const PLANS = ['basico', 'profesional', 'estudio'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STUDIO_NOT_FOUND = { message: 'Estudio no encontrado.' };
const USER_NOT_FOUND = { message: 'Usuario no encontrado.' };
const EMAIL_TAKEN = { message: 'Ya existe una cuenta con ese correo.' };

function email(raw, label = 'El correo') {
  const value = requiredText(raw, label, 160).toLowerCase();
  if (!EMAIL_RE.test(value)) throw new FieldError(`${label} no tiene un formato válido.`);
  return value;
}

/** Una contraseña temporal y su hash. */
async function newPassword() {
  const plain = tempPassword();
  return { plain, hash: await bcrypt.hash(plain, 10) };
}

const isUniqueViolation = (err) => err.code === '23505';

// GET /api/admin/studios  → estudios con tatuadores y métricas, más los totales (HU35, HU36)
async function listStudios(req, res) {
  try {
    const studios = await studioModel.listWithStats();
    const tattooists = studios.flatMap((s) => s.tattooists);
    const sum = (key) => studios.reduce((n, s) => n + s[key], 0);
    return res.json({
      studios,
      totals: {
        studios: studios.length,
        activeStudios: studios.filter((s) => s.active).length,
        tattooists: tattooists.length,
        activeTattooists: tattooists.filter((t) => t.active).length,
        sessions: sum('sessions_total'),
        upcomingAppointments: sum('upcoming_appointments'),
        sketches: sum('sketches_total'),
        clients: sum('clients_total'),
      },
    });
  } catch (err) {
    return sendError(res, err, 'listando estudios');
  }
}

// GET /api/admin/users  → todas las cuentas con su estudio y su uso (HU35, HU36)
async function listUsers(req, res) {
  try {
    return res.json({ users: await userModel.listAllWithStats() });
  } catch (err) {
    return sendError(res, err, 'listando usuarios');
  }
}

// POST /api/admin/studios  { name, email, plan, ownerName, ownerEmail? }  (HU31)
// → 201 { studio, user, temporaryPassword }
async function createStudio(req, res) {
  const body = req.body ?? {};
  try {
    const studio = {
      name: requiredText(body.name, 'El nombre del estudio', 120),
      email: email(body.email, 'El correo del estudio'),
      plan: oneOf(body.plan ?? 'basico', PLANS, 'Plan no válido.'),
    };
    const owner = {
      name: requiredText(body.ownerName, 'El nombre del tatuador', 120),
      email: body.ownerEmail ? email(body.ownerEmail, 'El correo del tatuador') : studio.email,
    };

    if (await userModel.findByEmail(owner.email)) return res.status(409).json(EMAIL_TAKEN);

    const password = await newPassword();
    const created = await studioModel.createWithOwner({
      studio,
      owner: { ...owner, passwordHash: password.hash, mustChange: true },
    });
    return res.status(201).json({ ...created, temporaryPassword: password.plain });
  } catch (err) {
    if (isUniqueViolation(err)) return res.status(409).json(EMAIL_TAKEN);
    return sendError(res, err, 'creando el estudio');
  }
}

// PATCH /api/admin/studios/:id  { name?, email?, plan?, active?, ownerId? }  (HU32)
async function updateStudio(req, res) {
  if (!isUuid(req.params.id)) return res.status(404).json(STUDIO_NOT_FOUND);
  const body = req.body ?? {};
  try {
    const fields = {
      name: body.name === undefined ? undefined : requiredText(body.name, 'El nombre del estudio', 120),
      email: body.email === undefined ? undefined : email(body.email, 'El correo del estudio'),
      plan: oneOf(body.plan, PLANS, 'Plan no válido.'),
      active: boolean(body.active, 'El estado del estudio no es válido.'),
      ownerId: undefined,
    };
    // El dueño tiene que ser uno de los tatuadores del estudio.
    if (body.ownerId !== undefined) {
      const owner = isUuid(body.ownerId) ? await userModel.findById(body.ownerId) : null;
      if (!owner || owner.studio_id !== req.params.id) {
        throw new FieldError('El dueño tiene que ser uno de los tatuadores de este estudio.');
      }
      fields.ownerId = owner.id;
    }
    const studio = await studioModel.update(req.params.id, fields);
    if (!studio) return res.status(404).json(STUDIO_NOT_FOUND);

    // Activar o desactivar un estudio cambia lo que pueden hacer todos sus tatuadores.
    if (fields.active !== undefined) accountStatus.invalidate();
    return res.json({ studio });
  } catch (err) {
    return sendError(res, err, 'actualizando el estudio');
  }
}

// POST /api/admin/studios/:id/tattooists  { name, email }  (HU33)
// → 201 { user, temporaryPassword }
async function addTattooist(req, res) {
  if (!isUuid(req.params.id)) return res.status(404).json(STUDIO_NOT_FOUND);
  const body = req.body ?? {};
  try {
    const name = requiredText(body.name, 'El nombre del tatuador', 120);
    const mail = email(body.email, 'El correo del tatuador');
    if (await userModel.findByEmail(mail)) return res.status(409).json(EMAIL_TAKEN);

    const password = await newPassword();
    const user = await studioModel.addTattooist(req.params.id, {
      name,
      email: mail,
      passwordHash: password.hash,
      mustChange: true,
    });
    if (!user) return res.status(404).json(STUDIO_NOT_FOUND);
    return res.status(201).json({ user, temporaryPassword: password.plain });
  } catch (err) {
    if (isUniqueViolation(err)) return res.status(409).json(EMAIL_TAKEN);
    return sendError(res, err, 'agregando el tatuador');
  }
}

// PATCH /api/admin/users/:id  { active }  (HU34)
async function updateUser(req, res) {
  if (!isUuid(req.params.id)) return res.status(404).json(USER_NOT_FOUND);
  try {
    const active = boolean(req.body?.active, 'El estado de la cuenta no es válido.');
    if (active === undefined) throw new FieldError('Indica si la cuenta queda activa o no.');

    if (!active && req.params.id === req.user.sub) {
      return res.status(400).json({ message: 'No puedes desactivar tu propia cuenta.' });
    }
    const target = await userModel.findById(req.params.id);
    if (!target) return res.status(404).json(USER_NOT_FOUND);
    if (!active && target.role === 'admin' && target.active && (await userModel.countActiveAdmins()) <= 1) {
      return res.status(409).json({ message: 'Es el único administrador activo: la plataforma quedaría sin ninguno.' });
    }

    const user = await userModel.setActive(req.params.id, active);
    accountStatus.invalidate(req.params.id);
    return res.json({ user });
  } catch (err) {
    return sendError(res, err, 'actualizando la cuenta');
  }
}

// POST /api/admin/users/:id/reset-password  → { temporaryPassword }  (HU38)
async function resetPassword(req, res) {
  if (!isUuid(req.params.id)) return res.status(404).json(USER_NOT_FOUND);
  try {
    const target = await userModel.findById(req.params.id);
    if (!target) return res.status(404).json(USER_NOT_FOUND);

    const password = await newPassword();
    // Es temporal: la próxima vez que entre, la app le pedirá cambiarla.
    await userModel.updatePassword(target.id, password.hash, { mustChange: true });
    // Un enlace de «olvidé mi contraseña» pendiente ya no debe servir.
    await passwordResetModel.deleteByUserId(target.id);
    return res.json({ temporaryPassword: password.plain });
  } catch (err) {
    return sendError(res, err, 'restableciendo la contraseña');
  }
}

module.exports = { listStudios, listUsers, createStudio, updateStudio, addTattooist, updateUser, resetPassword, PLANS };
