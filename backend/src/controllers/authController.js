const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const userModel = require('../models/userModel');
const passwordResetModel = require('../models/passwordResetModel');
const emailService = require('../services/emailService');

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_changeme';
const TOKEN_TTL = '7d';

function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, {
    expiresIn: TOKEN_TTL,
  });
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email };
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

    return res.json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    console.error('Error en login:', err);
    return res.status(500).json({ message: 'Error interno. Inténtalo de nuevo.' });
  }
}

// POST /api/auth/register  (HU01)
async function register(req, res) {
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

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await userModel.create({ name, email, passwordHash });

    return res.status(201).json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
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
