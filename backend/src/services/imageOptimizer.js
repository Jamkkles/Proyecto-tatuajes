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

/**
 * Perfil de tinta del boceto: cuánta lleva y de qué colores. Es la entrada del
 * motor de cotización (HU14).
 *
 * Devuelve dos medidas distintas, calculadas en una sola pasada porque recorren
 * los mismos píxeles:
 *
 * **Cobertura** — qué fracción del lienzo está entintada. El rectángulo del
 * boceto por sí solo miente: un lettering fino y un blackwork macizo de 10×10 cm
 * no gastan ni de cerca lo mismo. En vez de contar píxeles contra un umbral
 * fijo se promedia cuánta tinta aporta cada uno:
 *
 *     cobertura = Σ ( alpha · max(1 − luminancia, saturación) ) / total de píxeles
 *
 * Así un fondo blanco o transparente aporta 0, una línea negra aporta 1, y un
 * gris o un borde suavizado aportan su parte proporcional. Un umbral duro
 * contaría el antialiasing como línea llena e inflaría los diseños de detalle.
 *
 * La saturación entra en el máximo porque la luminancia sola subestima el
 * color: un amarillo macizo es piel completamente tatuada, pero es claro, y
 * medido solo por oscuridad daba un 22% de cobertura. Con esto, el mismo
 * dibujo relleno en negro o en amarillo cuesta lo que debe costar.
 *
 * **Paleta** — las familias de color dominantes con su parte del área
 * entintada, para repartir los mililitros entre las tintas del inventario.
 * Aquí sí hace falta un umbral: la paleta responde "qué tintas", y para eso
 * solo valen los píxeles que son tinta sin discusión. Con el aporte continuo
 * de la cobertura, el halo claro alrededor de una línea negra entraba como una
 * familia gris con un tercio del diseño, que es exactamente lo que no es.
 *
 * Los colores se agrupan en un cubo RGB de 8×8×8: suficiente para separar
 * familias de tinta sin fragmentar un mismo rojo en diez tonos.
 *
 * Se mide sobre una versión reducida: ni la proporción de tinta ni la mezcla de
 * colores cambian al escalar, y evita recorrer millones de píxeles por subida.
 */
const INK_SAMPLE_SIZE = 256;

/** Por debajo de esto, un píxel no cuenta como tinta para la paleta. */
const INK_THRESHOLD = 0.45;

/** Familias por debajo de esta parte del diseño son ruido, no una tinta. */
const MIN_SHARE = 0.03;

/** Más de esto no aporta: nadie carga quince tintas en una sesión. */
const MAX_PALETTE = 6;

async function readInkProfile(buffer) {
  try {
    const { data, info } = await sharp(buffer)
      .resize({
        width: INK_SAMPLE_SIZE,
        height: INK_SAMPLE_SIZE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const channels = info.channels;
    const pixels = info.width * info.height;
    if (!pixels) return { inkRatio: null, palette: null };

    const bins = new Map();
    let coverage = 0;
    let solid = 0;

    for (let i = 0; i < data.length; i += channels) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const alpha = data[i + 3] / 255;

      // Luminancia percibida (Rec. 709): el ojo pesa mucho más el verde.
      const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      // Un color saturado es tinta aunque sea claro (un amarillo lo es), así
      // que cuenta lo que más destaque: su oscuridad o su saturación.
      const max = Math.max(r, g, b);
      const saturation = max === 0 ? 0 : (max - Math.min(r, g, b)) / max;

      // La misma noción de "tinta" alimenta las dos medidas: la cobertura la
      // integra sobre todo el lienzo, la paleta solo mira los píxeles que la
      // superan con holgura.
      const ink = alpha * Math.max(1 - luminance, saturation);
      coverage += ink;
      if (ink < INK_THRESHOLD) continue;

      solid += ink;
      const key = `${r >> 5},${g >> 5},${b >> 5}`;
      const bin = bins.get(key) ?? { weight: 0, r: 0, g: 0, b: 0 };
      bin.weight += ink;
      bin.r += r * ink;
      bin.g += g * ink;
      bin.b += b * ink;
      bins.set(key, bin);
    }

    // Se redondea antes de descartar: un lienzo en blanco deja un residuo de
    // coma flotante que no es cero pero sí lo es al guardarlo, y la columna
    // exige (0, 1] — un área efectiva nula no se puede cotizar.
    const inkRatio = Math.min(1, Number((coverage / pixels).toFixed(5)));
    if (!Number.isFinite(inkRatio) || inkRatio <= 0) return { inkRatio: null, palette: null };

    const palette = solid > 0 ? buildPalette(bins, solid) : null;
    return { inkRatio, palette };
  } catch {
    return { inkRatio: null, palette: null };
  }
}

/** Convierte las celdas del cubo en familias de color con su parte del área. */
function buildPalette(bins, solid) {
  const entries = [...bins.values()]
    .sort((x, y) => y.weight - x.weight)
    .slice(0, MAX_PALETTE)
    .filter((bin) => bin.weight / solid >= MIN_SHARE)
    .map((bin) => ({
      hex:
        '#' +
        [bin.r, bin.g, bin.b]
          .map((sum) => Math.round(sum / bin.weight).toString(16).padStart(2, '0'))
          .join(''),
      share: bin.weight / solid,
    }));

  if (!entries.length) return null;

  // Se renormaliza sobre lo que quedó: lo descartado por ser ruido no puede
  // dejar un trozo del diseño sin tinta asignada.
  const total = entries.reduce((sum, e) => sum + e.share, 0);
  return entries.map((e) => ({ hex: e.hex, share: Number((e.share / total).toFixed(4)) }));
}

module.exports = { optimizeImage, readDimensions, readInkProfile };