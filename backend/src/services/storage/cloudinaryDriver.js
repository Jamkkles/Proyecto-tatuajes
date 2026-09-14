// Driver de almacenamiento en la nube (Cloudinary).
// Se activa con STORAGE_DRIVER=cloudinary y las credenciales en el .env.
// Nada fuera de este archivo sabe que existe Cloudinary: el resto del backend
// solo llama a save() / remove().
const { v2: cloudinary } = require('cloudinary');

const FOLDER = process.env.CLOUDINARY_FOLDER || 'tatuajes/sketches';

let configured = false;

function configure() {
  if (configured) return;

  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    throw new Error(
      'Faltan credenciales de Cloudinary: define CLOUDINARY_CLOUD_NAME, ' +
        'CLOUDINARY_API_KEY y CLOUDINARY_API_SECRET en el .env.'
    );
  }

  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
    secure: true,
  });
  configured = true;
}

/**
 * CLOUDINARY_FOLDER apunta a la carpeta de bocetos ('tatuajes/sketches'). Las
 * demás carpetas quedan como hermanas: 'sessions' → 'tatuajes/sessions'.
 */
function folderFor(folder) {
  if (folder === 'sketches') return FOLDER;
  const slash = FOLDER.lastIndexOf('/');
  return slash === -1 ? folder : `${FOLDER.slice(0, slash)}/${folder}`;
}

/**
 * Sube el buffer a Cloudinary dentro de una carpeta por usuario.
 * Devuelve el public_id como clave (es lo que necesita destroy()).
 */
function save({ buffer, userId, folder = 'sketches' }) {
  configure();

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: `${folderFor(folder)}/${userId}`, resource_type: 'image' },
      (err, result) => {
        if (err) return reject(err);
        resolve({ key: result.public_id, url: result.secure_url });
      }
    );
    stream.end(buffer);
  });
}

async function remove(key) {
  configure();
  await cloudinary.uploader.destroy(key, { resource_type: 'image' });
}

module.exports = { name: 'cloudinary', save, remove };
