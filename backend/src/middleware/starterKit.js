const materialModel = require('../models/materialModel');

/**
 * Le deja listo el inventario inicial a cada artista antes de atender el
 * inventario o las cotizaciones (ver `materialModel.ensureStarterKit`).
 *
 * Va aquí y no en el registro porque tiene que alcanzar también a las cuentas que
 * ya existían: una cuenta creada antes de esta función tampoco debe quedarse con
 * el inventario vacío.
 *
 * Nunca frena la petición. Si la siembra falla (la base cayó, o todavía no se
 * corrió `db:init` y falta la columna `materials_seeded_at`), se registra y se
 * sigue: el inventario se muestra vacío y el artista puede pedir el kit con su
 * botón. Lo contrario sería romper la pantalla por algo que es una comodidad.
 */
async function starterKit(req, res, next) {
  try {
    await materialModel.ensureStarterKit(req.user.sub);
  } catch (err) {
    console.error('No se pudo preparar el inventario inicial:', err.message);
  }
  next();
}

module.exports = { starterKit };
