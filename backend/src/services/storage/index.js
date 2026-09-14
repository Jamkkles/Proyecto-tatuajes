// Selector de driver de almacenamiento.
//
// Todo el backend guarda imágenes a través de este módulo, nunca escribiendo a
// disco ni llamando a un SDK de nube directamente. Cambiar de local a nube es
// cambiar una variable de entorno:
//
//   STORAGE_DRIVER=local       → disco (desarrollo)
//   STORAGE_DRIVER=cloudinary  → nube  (producción)
//
// Contrato que cumple cualquier driver:
//   save({ buffer, mimeType, userId, originalName, folder }) → { key, url }
//     folder: 'sketches' (por defecto) | 'sessions'
//   remove(key) → void
const DRIVERS = {
  local: () => require('./localDriver'),
  cloudinary: () => require('./cloudinaryDriver'),
};

/**
 * Devuelve un driver por nombre. Cada boceto guarda en la base de datos con
 * qué driver se subió, así que al borrar uno antiguo (subido antes de migrar a
 * la nube) se puede recuperar el driver correcto en vez de usar el activo.
 */
function getDriver(name) {
  const load = DRIVERS[name];
  if (!load) {
    throw new Error(
      `STORAGE_DRIVER="${name}" no es válido. Opciones: ${Object.keys(DRIVERS).join(', ')}.`
    );
  }
  return load();
}

const active = getDriver(process.env.STORAGE_DRIVER || 'local');

module.exports = { ...active, getDriver };
