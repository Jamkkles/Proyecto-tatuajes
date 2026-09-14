// Driver de almacenamiento en disco local.
// Guarda los archivos bajo `uploads/` y los sirve como estáticos desde Express.
// Pensado para desarrollo: en Docker basta con montar un volumen en esa carpeta.
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '../../../uploads');

// El frontend corre en otro puerto, así que las URLs deben ser absolutas.
const PUBLIC_URL = process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3000}`;

const EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/**
 * Escribe el archivo y devuelve cómo encontrarlo después.
 * La clave incluye el userId para que los archivos queden separados por artista.
 * `folder` separa bocetos ('sketches') de fotos de sesión ('sessions').
 */
async function save({ buffer, mimeType, userId, folder = 'sketches' }) {
  const ext = EXTENSIONS[mimeType] || 'bin';
  const key = `${folder}/${userId}/${crypto.randomUUID()}.${ext}`;
  const fullPath = path.join(UPLOAD_DIR, key);

  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, buffer);

  return { key, url: `${PUBLIC_URL}/uploads/${key}` };
}

/** Borra el archivo. Si ya no existe, no es un error. */
async function remove(key) {
  try {
    await fs.unlink(path.join(UPLOAD_DIR, key));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

module.exports = { name: 'local', save, remove, UPLOAD_DIR };
