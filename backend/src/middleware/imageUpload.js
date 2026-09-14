const multer = require('multer');

// Subida de una imagen en el campo `image` (bocetos y fotos de sesión).
const MAX_FILE_BYTES = Number(process.env.MAX_UPLOAD_BYTES) || 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

// El archivo se recibe en memoria: nunca toca el disco antes de que el driver
// decida dónde guardarlo (disco local o nube).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME.includes(file.mimetype)) {
      return cb(new Error('Formato no permitido. Usa JPG, PNG, WEBP o GIF.'));
    }
    cb(null, true);
  },
});

/**
 * Middleware de subida. Traduce los errores de multer a respuestas JSON
 * con el mismo formato `{ message }` que usa el resto de la API.
 */
function imageUpload(req, res, next) {
  upload.single('image')(req, res, (err) => {
    if (!err) return next();

    if (err.code === 'LIMIT_FILE_SIZE') {
      const mb = (MAX_FILE_BYTES / (1024 * 1024)).toFixed(0);
      return res.status(413).json({ message: `La imagen supera el límite de ${mb} MB.` });
    }
    return res.status(400).json({ message: err.message });
  });
}

module.exports = { imageUpload, MAX_FILE_BYTES, ALLOWED_MIME };
