const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const userModel = require('../models/userModel');
const studioModel = require('../models/studioModel');
const accountStatus = require('../services/accountStatus');
const passwordResetModel = require('../models/passwordResetModel');
const emailService = require('../services/emailService');

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

const { loadJwtSecret } = require('../config/jwt');
const { registrationOpen } = require('../middleware/security');

const JWT_SECRET = loadJwtSecret();
const TOKEN_TTL = '7d';

function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, {
    expiresIn: TOKEN_TTL,
  });
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role ?? 'tatuador' };
}

// POST /api/auth/login  (HU02)
async function login(req, res) {
  const { email, password } = req.body ?? {};

  if (!email || !password) {
    return res.status(400).json({ message: 'Correo y contraseña son obligatorios.' });
  }

  try {
    const user = await userModel.findByEmail(email);
    // Mismo mensaje para usuario inexistente o contraseña incorrecta (no filtrar cuáles correos existen).
    if (!user) {
      return res.status(401).json({ message: 'Correo o contraseña incorrectos.' });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ message: 'Correo o contraseña incorrectos.' });
    }

    // Recién con la contraseña correcta se dice si la cuenta está desactivada: así nadie
    // averigua el estado de una cuenta ajena probando correos (HU32, HU34).
    const status = accountStatus.decide(user);
    if (!status.ok) return res.status(403).json({ message: status.message, code: status.reason });

    return res.json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    console.error('Error en login:', err);
    return res.status(500).json({ message: 'Error interno. Inténtalo de nuevo.' });
  }
}

// POST /api/auth/register  (HU01)
async function register(req, res) {
  // En producción el estudio ya tiene su cuenta (la siembra `db:init`): dejar el
  // registro abierto permitiría que cualquiera creara una en tu instancia.
  if (!registrationOpen()) {
    return res.status(403).json({ message: 'El registro de cuentas nuevas está cerrado.' });
  }

  const { name, email, password } = req.body ?? {};

  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Nombre, correo y contraseña son obligatorios.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ message: 'La contraseña debe tener al menos 8 caracteres.' });
  }

  try {
    const existing = await userModel.findByEmail(email);
    if (existing) {
      return res.status(409).json({ message: 'Ya existe una cuenta con ese correo.' });
    }

    // Quien se registra solo queda como su propio estudio, con plan básico: el
    // administrador lo ve en su listado como cualquier otro.
    const passwordHash = await bcrypt.hash(password, 10);
    const { user } = await studioModel.createWithOwner({
      studio: { name, email, plan: 'basico' },
      owner: { name, email, passwordHash },
    });

    return res.status(201).json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    // Dos registros simultáneos con el mismo correo: el segundo choca con el UNIQUE.
    if (err.code === '23505') {
      return res.status(409).json({ message: 'Ya existe una cuenta con ese correo.' });
    }
    console.error('Error en register:', err);
    return res.status(500).json({ message: 'Error interno. Inténtalo de nuevo.' });
  }
}

// POST /api/auth/forgot-password  (HU03)
async function forgotPassword(req, res) {
  const { email } = req.body ?? {};
  if (!email) {
    return res.status(400).json({ message: 'El correo es obligatorio.' });
  }

  try {
    const user = await userModel.findByEmail(email);
    // Respuesta idéntica exista o no el correo (no revelar qué cuentas hay).
    if (user) {
      const token = await passwordResetModel.create(user.id);
      const resetUrl = `${FRONTEND_URL}/nueva-contrasena?token=${token}`;
      await emailService.sendPasswordReset({ to: user.email, resetUrl });
    }
    return res.json({ message: 'Si el correo está registrado, recibirás un enlace de recuperación.' });
  } catch (err) {
    console.error('Error en forgotPassword:', err);
    return res.status(500).json({ message: 'Error interno. Inténtalo de nuevo.' });
  }
}

// POST /api/auth/reset-password  (HU03)
async function resetPassword(req, res) {
  const { token, password } = req.body ?? {};

  if (!token || !password) {
    return res.status(400).json({ message: 'Token y contraseña son obligatorios.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ message: 'La contraseña debe tener al menos 8 caracteres.' });
  }

  try {
    const record = await passwordResetModel.findValidByToken(token);
    if (!record) {
      return res.status(400).json({ message: 'El enlace no es válido o ya expiró.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await userModel.updatePassword(record.user_id, passwordHash);
    await passwordResetModel.deleteByUserId(record.user_id);

    return res.json({ message: 'Contraseña actualizada. Ya puedes iniciar sesión.' });
  } catch (err) {
    console.error('Error en resetPassword:', err);
    return res.status(500).json({ message: 'Error interno. Inténtalo de nuevo.' });
  }
}

module.exports = { login, register, forgotPassword, resetPassword };
