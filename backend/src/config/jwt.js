/**
 * Secreto con el que se firman las sesiones (JWT).
 *
 * En desarrollo hay un valor por defecto para no tener que configurar nada. En
 * producción ese valor es una puerta abierta: quien lo conozca —y está en el
 * repositorio— puede fabricar una sesión de cualquier artista. Por eso, con
 * `NODE_ENV=production` el servidor se niega a arrancar si el secreto falta, es
 * el de ejemplo o es demasiado corto, en vez de funcionar "de mentira".
 */
const DEV_SECRET = 'dev_secret_changeme';
const EXAMPLE_SECRET = 'cambia_este_secreto_en_produccion';
const MIN_PRODUCTION_LENGTH = 32;

function loadJwtSecret(env = process.env) {
  const secret = env.JWT_SECRET || DEV_SECRET;

  if (env.NODE_ENV === 'production') {
    const weak =
      secret === DEV_SECRET || secret === EXAMPLE_SECRET || secret.length < MIN_PRODUCTION_LENGTH;
    if (weak) {
      throw new Error(
        `JWT_SECRET no es seguro para producción: define uno aleatorio de al menos ${MIN_PRODUCTION_LENGTH} caracteres.`
      );
    }
  }
  return secret;
}

module.exports = { loadJwtSecret, DEV_SECRET };
