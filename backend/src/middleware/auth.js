const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_changeme';

/**
 * Protege rutas privadas. Espera el header `Authorization: Bearer <token>`.
 * Si es válido, deja el payload en req.user; si no, responde 401.
 */
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ message: 'No autorizado.' });
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({ message: 'Sesión expirada o token inválido.' });
  }
}

module.exports = { requireAuth };
