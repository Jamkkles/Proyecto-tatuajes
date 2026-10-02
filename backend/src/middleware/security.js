const rateLimit = require('express-rate-limit');

const isProduction = (env) => env.NODE_ENV === 'production';

/**
 * Orígenes que pueden llamar a la API desde un navegador.
 *
 * `CORS_ORIGIN` lleva uno o varios separados por comas. Sin definir, en
 * desarrollo se acepta cualquiera (el frontend corre en otro puerto) y en
 * producción **ninguno**: es preferible que falle a la vista a dejar la API
 * abierta a cualquier sitio web.
 */
function corsOptions(env = process.env) {
  const allowed = (env.CORS_ORIGIN ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  return {
    origin: allowed.length ? allowed : !isProduction(env),
    // Con la API en otro dominio, cada acción dispara antes una petición de
    // permiso. Guardarla un día evita repetirla — y repetirla contra un servidor
    // gratis que despierta es lo más lento que hay.
    maxAge: 86_400,
  };
}

/** ¿Se permite crear cuentas nuevas? Cerrado por defecto en producción. */
function registrationOpen(env = process.env) {
  if (env.ALLOW_REGISTER === 'true') return true;
  if (env.ALLOW_REGISTER === 'false') return false;
  return !isProduction(env);
}

/**
 * Límite de intentos para las rutas de autenticación, por IP.
 *
 * Sin él, el login se puede probar miles de veces por minuto. 20 intentos cada
 * 15 minutos no molestan a una persona que se equivoca de clave y sí frenan a
 * un programa.
 */
function createAuthLimiter({ max = 20, windowMs = 15 * 60 * 1000 } = {}) {
  return rateLimit({
    windowMs,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { message: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.' },
    // Las pruebas del controlador hacen decenas de logins desde la misma IP.
    skip: () => process.env.NODE_ENV === 'test',
  });
}

/**
 * Cuántos proxies hay delante del servidor. En Render hay uno: sin esto toda
 * petición parece venir de la misma IP y el límite de intentos bloquearía a
 * todos a la vez en lugar de a quien abusa.
 */
function trustProxy(env = process.env) {
  if (env.TRUST_PROXY !== undefined) {
    const hops = Number(env.TRUST_PROXY);
    return Number.isInteger(hops) && hops >= 0 ? hops : false;
  }
  return isProduction(env) ? 1 : false;
}

module.exports = { corsOptions, registrationOpen, createAuthLimiter, trustProxy };
