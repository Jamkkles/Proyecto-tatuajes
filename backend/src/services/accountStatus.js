const userModel = require('../models/userModel');

/*
 * ¿Puede esta cuenta seguir usando la app? Lo pregunta `requireAuth` en cada petición: un
 * token dura 7 días, así que sin esto un tatuador o estudio desactivado por el
 * administrador (HU32, HU34) seguiría entrando hasta que el token venciera.
 *
 * La respuesta se guarda 30 segundos por cuenta para no consultar la base en cada
 * petición; el administrador limpia la memoria al activar o desactivar, así que en este
 * servidor el cambio es inmediato (un cambio hecho a mano en la base tarda hasta 30 s).
 */

const TTL_MS = 30_000;

const MESSAGES = {
  missing: 'Tu cuenta ya no existe. Inicia sesión de nuevo.',
  user_inactive: 'Tu cuenta está desactivada. Escríbele al administrador de la plataforma.',
  studio_inactive: 'La cuenta de tu estudio está desactivada. Escríbele al administrador de la plataforma.',
};

/**
 * Decide con la fila de la cuenta (`role`, `active`, `studio_active`). Un administrador no
 * depende de un estudio. Un tatuador sin estudio (cuentas anteriores a los estudios, hasta
 * que se corra `db:init`) puede entrar: su `studio_active` es null, no false.
 *
 * @returns {{ ok: true, role: string } | { ok: false, reason: string, message: string }}
 */
function decide(row) {
  if (!row) return { ok: false, reason: 'missing', message: MESSAGES.missing };
  if (!row.active) return { ok: false, reason: 'user_inactive', message: MESSAGES.user_inactive };
  if (row.role !== 'admin' && row.studio_active === false) {
    return { ok: false, reason: 'studio_inactive', message: MESSAGES.studio_inactive };
  }
  return { ok: true, role: row.role };
}

const cache = new Map();

async function check(userId, { now = Date.now() } = {}) {
  const hit = cache.get(userId);
  if (hit && now - hit.at < TTL_MS) return hit.value;

  const value = decide(await userModel.findAccess(userId));
  cache.set(userId, { value, at: now });
  return value;
}

/** Olvida lo guardado de una cuenta, o de todas (al desactivar un estudio entero). */
function invalidate(userId) {
  if (userId === undefined) cache.clear();
  else cache.delete(userId);
}

module.exports = { check, decide, invalidate, TTL_MS, MESSAGES };
