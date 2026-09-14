const sharp = require('sharp');
const { imageSize } = require('image-size');

// Los bocetos solo se muestran como miniatura (galería/carrusel, ~320px), así
// que no hace falta conservar la resolución original de la foto/captura que
// suba el artista. El GIF se deja intacto para no romper la animación.
const MAX_DIMENSION = 1200;

async function optimizeImage(buffer, mimeType) {
  if (mimeType === 'image/gif') return buffer;

  const image = sharp(buffer).rotate().resize({
    width: MAX_DIMENSION,
    height: MAX_DIMENSION,
    fit: 'inside',
    withoutEnlargement: true,
  });

  if (mimeType === 'image/png') return image.png({ compressionLevel: 9 }).toBuffer();
  if (mimeType === 'image/webp') return image.webp({ quality: 82 }).toBuffer();
  return image.jpeg({ quality: 82, mozjpeg: true }).toBuffer();
}

/** Lee ancho y alto del buffer. Si el formato no se reconoce, devuelve nulos. */
function readDimensions(buffer) {
  try {
    const { width, height } = imageSize(buffer);
    return { width, height };
  } catch {
    return { width: null, height: null };
  }
}

module.exports = { optimizeImage, readDimensions };
