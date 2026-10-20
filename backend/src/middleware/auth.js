const jwt = require('jsonwebtoken');

const { loadJwtSecret } = require('../config/jwt');
const accountStatus = require('../services/accountStatus');

const JWT_SECRET = loadJwtSecret();

/**
 * Protege rutas privadas. Espera el header `Authorization: Bearer <token>`.
 * Si es válido y la cuenta sigue activa (ella y su estudio), deja el payload en
 * req.user y el rol en req.account; si no, responde 401, y el frontend cierra la sesión.
 */
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ message: 'No autorizado.' });
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ message: 'Sesión expirada o token inválido.' });
  }

  let status;
  try {
    status = await accountStatus.check(req.user.sub);
  } catch (err) {
    console.error('Error comprobando la cuenta:', err.message);
    return res.status(503).json({ message: 'No pudimos comprobar tu cuenta. Inténtalo de nuevo.' });
  }
  if (!status.ok) return res.status(401).json({ message: status.message, code: status.reason });

  req.account = { role: status.role };
  return next();
}

/** Solo para el administrador de la plataforma. Va después de requireAuth. */
function requireAdmin(req, res, next) {
  if (req.account?.role !== 'admin') {
    return res.status(403).json({ message: 'Solo el administrador de la plataforma puede hacer esto.' });
  }
  return next();
}

module.exports = { requireAuth, requireAdmin };
