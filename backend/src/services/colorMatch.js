/**
 * Emparejamiento entre los colores de un boceto y las tintas del inventario
 * (HU14, parte de color).
 *
 * El trabajo se hace en **OKLab** y no en RGB porque la distancia en RGB no
 * corresponde a lo que el ojo llama "el mismo color": dos azules que cualquiera
 * distinguiría pueden quedar más cerca en RGB que un rojo y un naranja.
 *
 * Calibración del umbral, medida sobre un inventario típico
 * (negro, blanco, rojo, azul, verde, amarillo):
 *
 *   variantes de una tinta que SÍ está        d ≤ 0,05
 *     rojo claro 0,048 · rojo oscuro 0,029 · naranja 0,053 · turquesa 0,051
 *   colores que NO están en el inventario     d ≥ 0,15
 *     morado 0,150 · rosa 0,153
 *
 * Por eso el corte va en 0,12: deja pasar los matices de una misma tinta y
 * marca como faltante lo que de verdad exige comprar otra.
 */

const HEX_RE = /^#?([0-9a-f]{6})$/i;

/**
 * Por debajo de esta croma, un color es gris y no tiene tono propio.
 *
 * Estaba en 0,04 y se comía los cafés: el pelaje de un gato (#4c362d, croma
 * 0,035) pasaba por gris, se iba entero a la tinta negra y la cotización de un
 * dibujo a color salía solo con negro. Un gris de verdad —incluso con el tinte
 * que deja la compresión JPG— no pasa de 0,01.
 */
const ACROMATICO = 0.02;

/**
 * Los tonos muy oscuros son la excepción: un casi-negro algo cálido (#281913)
 * se tatúa con negro, no con una tinta café aparte. Por debajo de esta
 * luminosidad se tolera la croma de antes.
 */
const L_CASI_NEGRO = 0.3;
const ACROMATICO_OSCURO = 0.04;

/** Distancia máxima para considerar que una tinta sirve para ese color. */
const DISTANCIA_MAX = 0.12;

/**
 * Una tinta oscura con L por encima de esto ya no sirve de negro. Deja fuera
 * la tinta blanca, que es acromática pero clarísima.
 */
const L_MAX_OSCURA = 0.6;

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** '#c0392b' → { L, a, b } en OKLab. Devuelve null si el hex no es válido. */
function hexToOklab(hex) {
  const match = HEX_RE.exec(String(hex ?? '').trim());
  if (!match) return null;

  const n = parseInt(match[1], 16);
  const r = srgbToLinear(((n >> 16) & 255) / 255);
  const g = srgbToLinear(((n >> 8) & 255) / 255);
  const b = srgbToLinear((n & 255) / 255);

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

const chroma = (c) => Math.hypot(c.a, c.b);

/** ¿Este color se resuelve con la tinta oscura (gris o casi negro)? */
const isGray = (c) =>
  chroma(c) < ACROMATICO || (c.L < L_CASI_NEGRO && chroma(c) < ACROMATICO_OSCURO);

/**
 * Distancia perceptual entre dos colores.
 *
 * La luminosidad pesa la mitad: una misma tinta roja da rojos claros y oscuros
 * según cuánto se cargue la aguja, pero sigue siendo el mismo frasco.
 */
const distance = (x, y) => Math.hypot((x.L - y.L) * 0.5, x.a - y.a, x.b - y.b);

/**
 * Busca la tinta del inventario que corresponde a un color del boceto.
 *
 * @param {string} hex       color detectado en el boceto
 * @param {Array}  inks      insumos con `color_hex` (ya convertidos con `prepareInks`)
 * @returns {object|null} la tinta, o null si no hay ninguna que sirva
 */
function matchInk(hex, inks) {
  const color = hexToOklab(hex);
  if (!color || !inks.length) return null;

  // Un gris es negro rebajado, no tinta blanca: así se consiguen los grises al
  // tatuar. Y una tinta blanca sobre un lienzo blanco es indetectable por
  // definición, así que nunca se asigna sola.
  if (isGray(color)) {
    const oscuras = inks.filter((i) => isGray(i.lab) && i.lab.L < L_MAX_OSCURA);
    if (!oscuras.length) return null;
    return oscuras.reduce((mas, i) => (i.lab.L < mas.lab.L ? i : mas));
  }

  let best = null;
  let bestDistance = Infinity;
  for (const ink of inks) {
    if (isGray(ink.lab)) continue;
    const d = distance(color, ink.lab);
    if (d < bestDistance) {
      bestDistance = d;
      best = ink;
    }
  }
  return bestDistance <= DISTANCIA_MAX ? best : null;
}

/** Deja los insumos con color listos para comparar (convierte el hex una vez). */
function prepareInks(materials) {
  return materials
    .map((material) => ({ material, lab: hexToOklab(material.color_hex) }))
    .filter((i) => i.lab !== null);
}

/**
 * Reparte el área entintada del boceto entre las tintas del inventario.
 *
 * @param {Array} palette    `[{ hex, share }]` del boceto; `share` suma ~1
 * @param {Array} materials  insumos candidatos (los que tienen `color_hex`)
 * @returns {{ shares: Map<id, number>, missing: Array }}
 *   `shares` es cuánta parte del área le toca a cada tinta. `missing` son los
 *   colores del diseño sin tinta equivalente: **no se reparten entre las demás**,
 *   porque ese trozo del tatuaje de verdad no se puede hacer con lo que hay.
 */
function allocatePalette(palette, materials) {
  const inks = prepareInks(materials);
  const shares = new Map();
  const missing = [];

  for (const entry of palette ?? []) {
    const share = Number(entry?.share);
    if (!Number.isFinite(share) || share <= 0) continue;

    const ink = matchInk(entry.hex, inks);
    if (!ink) {
      missing.push({ hex: entry.hex, share });
      continue;
    }
    const id = ink.material.id;
    shares.set(id, (shares.get(id) ?? 0) + share);
  }

  return { shares, missing };
}

/**
 * ¿A este insumo hay que repartirle el área por color?
 *
 * Solo a lo que se gasta **según el tamaño** y es tinta. Las copitas de tinta
 * están en la misma categoría pero se gastan por sesión: se sirven las que
 * hagan falta y da igual de qué color. Dejarlas dentro del reparto las sacaba
 * de la cotización, porque ninguna recibía parte del área.
 */
const isInk = (material) =>
  material.consumption_basis === 'area' &&
  (material.category === 'tintas' || Boolean(material.color_hex));

/**
 * Reparto cuando el boceto no tiene paleta medida.
 *
 * Sin paleta, la única información de color que hay es la que el artista eligió
 * a mano en el formulario, y **hay que usarla**: si dijo "solo negro", cobrar
 * tinta roja y amarilla es sencillamente un error.
 *
 * La regla que no se puede romper es que las partes sumen 1: el área entintada
 * se reparte entre las tintas, nunca se multiplica por cuántas haya en el
 * inventario. Cobrar cada tinta por el área completa daba N veces el costo real.
 *
 *   negro / grises → todo a la tinta oscura (los grises son negro rebajado)
 *   color          → la mitad al negro, que es donde casi siempre va la línea
 *                    y la sombra, y la otra mitad repartida entre los colores
 *
 * Con `color` el reparto entre colores es un promedio, no una medición: si el
 * artista quiere exactitud, el camino es elegir el boceto y dejar que se mida.
 * Pero el total sigue siendo correcto, que es lo que importa para el precio.
 */
function allocateByMode(materials, colorMode) {
  const inks = materials.filter(isInk);
  const shares = new Map();
  if (!inks.length) return { shares, missing: [] };

  const conColor = prepareInks(inks);
  const declarados = new Set(conColor.map((i) => i.material));

  // La tinta oscura identificada por su color. Si ninguna lo declara, sirven
  // las que no declaran color: una tinta sin color es candidata a ser el negro,
  // y una que SÍ declaró ser roja, desde luego, no lo es. Sin esta distinción
  // un tatuaje en negro acababa cotizando la tinta roja, que es el único color
  // que el inventario había declarado.
  const oscuras = conColor
    .filter((i) => isGray(i.lab) && i.lab.L < L_MAX_OSCURA)
    .sort((x, y) => x.lab.L - y.lab.L)
    .map((i) => i.material);
  const cromaticas = conColor
    .filter((i) => !isGray(i.lab))
    .map((i) => i.material);
  const sinColor = inks.filter((ink) => !declarados.has(ink));

  const base = oscuras.length ? [oscuras[0]] : sinColor.length ? sinColor : [];
  const reparte = (lista, parte) =>
    lista.forEach((ink) => shares.set(ink.id, (shares.get(ink.id) ?? 0) + parte / lista.length));

  if (colorMode !== 'color') {
    // Negro y grises: todo a la base oscura. Si no hay forma de identificarla,
    // se reparte entre todas para que el total siga siendo correcto.
    reparte(base.length ? base : inks, 1);
    return { shares, missing: [] };
  }

  // A color: la mitad al negro, que es donde casi siempre va la línea y la
  // sombra, y la otra mitad repartida entre los colores.
  if (!cromaticas.length) {
    reparte(base.length ? base : inks, 1);
  } else if (!base.length) {
    reparte(cromaticas, 1);
  } else {
    reparte(base, 0.5);
    reparte(cromaticas, 0.5);
  }
  return { shares, missing: [] };
}

/**
 * ¿El artista tiene alguna tinta que sirva para este color?
 *
 * Distinta pregunta que la del reparto: aquí da igual si la tinta tiene regla
 * de consumo. Tenerla y no haberle puesto tasa significa que no se puede
 * cotizar, no que haya que salir a comprarla.
 */
const coversColor = (hex, materials) => matchInk(hex, prepareInks(materials)) !== null;

/**
 * Tintas de referencia para los colores que el inventario no cubre.
 *
 * Cuando el diseño lleva un color sin tinta parecida en el inventario, la
 * cotización no puede callarse esa parte: el tatuaje la necesita igual y hay
 * que comprarla. Se cotiza con la tinta de esta lista que más se parezca, al
 * precio y rendimiento de referencia (los mismos del catálogo de
 * `MATERIAL_PRESETS` del frontend: frasco de 15 ml, $760 por ml).
 */
const TINTAS_REFERENCIA = [
  { name: 'Tinta negra', hex: '#111111', rate: 0.05, unitCost: 600 },
  { name: 'Tinta roja', hex: '#c0392b', rate: 0.01, unitCost: 760 },
  { name: 'Tinta naranja', hex: '#e07b2a', rate: 0.01, unitCost: 760 },
  { name: 'Tinta amarilla', hex: '#e6b800', rate: 0.01, unitCost: 760 },
  { name: 'Tinta verde', hex: '#2e8b57', rate: 0.01, unitCost: 760 },
  { name: 'Tinta celeste', hex: '#5dade2', rate: 0.01, unitCost: 760 },
  { name: 'Tinta azul', hex: '#2255aa', rate: 0.01, unitCost: 760 },
  { name: 'Tinta morada', hex: '#8e44ad', rate: 0.01, unitCost: 760 },
  { name: 'Tinta rosa', hex: '#e75a9c', rate: 0.01, unitCost: 760 },
  { name: 'Tinta café', hex: '#6f4e37', rate: 0.01, unitCost: 760 },
  { name: 'Tinta piel', hex: '#c69a72', rate: 0.01, unitCost: 760 },
].map((ink) => ({ ...ink, lab: hexToOklab(ink.hex) }));

/**
 * La tinta de referencia más parecida a un color. Aquí no hay distancia
 * máxima: siempre hay una "más parecida", y lo que se busca es ponerle nombre
 * y precio a lo que falta, no decidir si se tiene.
 */
function suggestInk(hex) {
  const color = hexToOklab(hex);
  if (!color) return null;
  if (isGray(color)) return TINTAS_REFERENCIA[0];
  return TINTAS_REFERENCIA.filter((ink) => !isGray(ink.lab)).reduce((best, ink) =>
    distance(color, ink.lab) < distance(color, best.lab) ? ink : best
  );
}

module.exports = {
  hexToOklab,
  isInk,
  coversColor,
  suggestInk,
  isGray,
  allocateByMode,
  matchInk,
  prepareInks,
  allocatePalette,
  distance,
  chroma,
  ACROMATICO,
  DISTANCIA_MAX,
};
