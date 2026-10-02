/**
 * Motor de cotización automatizada (HU14).
 *
 * Calcula cuánto insumo se gasta en un tatuaje y cuánto cuesta ese gasto,
 * partiendo del boceto y del tamaño real que tendrá sobre la piel. El alcance
 * del proyecto es explícito: **solo costos objetivos de material**. Lo que el
 * artista cobra por su arte no se modela aquí.
 *
 * El cálculo se apoya en tres ideas:
 *
 * 1. **Área efectiva.** El rectángulo del boceto miente: un lettering fino y
 *    un blackwork macizo de 10×10 cm gastan cosas muy distintas. Por eso el
 *    área se pondera por la cobertura de tinta del PNG (`inkRatio`), medida
 *    sobre los píxeles al subir el boceto.
 *
 *        área efectiva = ancho_cm × alto_cm × cobertura
 *
 * 2. **Base de consumo.** Cada insumo del inventario declara cómo escala su
 *    gasto (`consumption_basis`): con el área, con la cantidad de sesiones,
 *    con las horas de trabajo, o no escala (la máquina no se consume).
 *
 * 3. **Variables de trazado.** El grosor del trazo y el uso de color son las
 *    "variables de trazado" de la HU14: multiplican el material y el tiempo.
 *
 * Y una cuarta, cuando el boceto trae paleta medida: las tintas no se cotizan
 * todas por el área completa, sino cada una por la parte del diseño que de
 * verdad lleva su color. Un dibujo con 30% de rojo gasta rojo por ese 30%, no
 * por el total.
 *
 * Todas las constantes de abajo son el punto de calibración con el tatuador
 * experto: son las que se ajustan con su experiencia real, no valores fijos
 * del sistema.
 */

/**
 * Multiplicadores del grosor de trazo.
 *
 * `material` sube con el grosor (un trazo grueso come más tinta y desgasta
 * más el cartucho). `time` baja: rellenar grueso avanza más rápido por cm²
 * que hacer línea fina de detalle.
 */
const STROKE = {
  fino: { material: 0.8, time: 1.25 },
  medio: { material: 1, time: 1 },
  grueso: { material: 1.3, time: 0.85 },
};

/**
 * Multiplicadores del modo de color. El color sube las dos cosas: hay que
 * cargar más pomos, cambiar de cartucho y pasar varias veces por la misma zona.
 */
const COLOR = {
  negro: { material: 1, time: 1 },
  grises: { material: 1.15, time: 1.2 },
  color: { material: 1.6, time: 1.5 },
};

const {
  allocateByMode,
  allocatePalette,
  coversColor,
  isInk,
  suggestInk,
} = require('./colorMatch');

/**
 * Rendimiento base: cm² de piel efectivamente entintada por hora de trabajo,
 * con trazo medio y a un solo color.
 *
 * Contrastado con los tiempos que se manejan en el oficio, convertidos a cm²
 * efectivos por hora:
 *
 *   media manga en negro y gris   ~15 h sobre ~900 cm² al 50%   → 30
 *   manga completa                30–40 h sobre ~1.900 cm² al 60% → 28–38
 *   espalda completa              30–50 h sobre ~2.475 cm² al 60% → 30–50
 *
 * Las piezas chicas rinden bastante menos por cm² (una pieza de antebrazo de
 * ~4 h sale en torno a 15), pero eso no es que se tatúe más lento: es el
 * tiempo fijo de montar, calcar y limpiar, que no escala con el tamaño. Por eso
 * va aparte en `MINUTOS_PREPARACION` en lugar de ensuciar este rendimiento.
 */
const CM2_POR_HORA = 30;

/**
 * Preparación de cada sesión: calcar, montar la estación, envolver la máquina,
 * limpiar al terminar y explicar los cuidados. No depende del tamaño del
 * tatuaje, y es lo que hace que una pieza chica nunca sea tan rápida como
 * sugeriría su área.
 */
const MINUTOS_PREPARACION = 30;

/**
 * Tope práctico de tatuaje efectivo por sesión. Más allá de esto la piel se
 * irrita y ni el cliente ni el artista rinden, así que la pieza se parte en
 * varias citas. Es lo que convierte el trabajo total en número de sesiones.
 *
 * En el oficio las sesiones van de 4 a 9 horas según la escala del trabajo; 5
 * es el punto que deja las piezas conocidas donde corresponde: una media manga
 * en 3 citas y una manga completa en 8.
 */
const HORAS_POR_SESION = 5;

/** Ninguna sesión baja de media hora, y se agenda en bloques de 15 minutos. */
const MIN_MINUTOS = 30;
const BLOQUE_MINUTOS = 15;

/** Tope de sesiones, el mismo que acepta la columna de la base. */
const MAX_SESIONES = 50;

/**
 * Cobertura por defecto para los bocetos que no la tienen medida (los que se
 * subieron antes de esta iteración). 35% es un diseño de línea con relleno
 * parcial: ni un lettering ni un blackwork macizo.
 */
const COBERTURA_POR_DEFECTO = 0.35;

const STROKES = Object.keys(STROKE);
const COLOR_MODES = Object.keys(COLOR);
const BASES = ['area', 'sesion', 'hora', 'ninguno'];

/** Redondea a 3 decimales; evita arrastrar basura de coma flotante. */
const round3 = (n) => Math.round(n * 1000) / 1000;

/**
 * Consumo de un insumo para este trabajo, en unidades del propio insumo.
 * Devuelve 0 si no participa (base `ninguno` o tasa sin definir).
 */
function consumption(material, { effectiveArea, sessionsCount, hours, materialFactor, share }) {
  const rate = Number(material.consumption_rate);
  if (!rate || rate <= 0) return 0;

  switch (material.consumption_basis) {
    // La tinta y las agujas son lo que escala con el tamaño del tatuaje, y lo
    // único a lo que se le aplican las variables de trazado.
    //
    // El piso de una unidad por sesión no es un redondeo: un cartucho y la
    // tinta servida en la copita son estériles y se botan al terminar, no se
    // guardan para el cliente siguiente. Sin este piso, un lettering chico
    // saldría cotizado en centésimas de cartucho, que nadie puede comprar.
    case 'area': {
      // `share` es la parte del diseño que le toca a esta tinta cuando hay
      // paleta medida. Para todo lo demás (cartuchos) es 1: una aguja no
      // distingue de qué color es el trazo que está haciendo.
      const area = effectiveArea * share;
      return round3(Math.max(sessionsCount, rate * area * materialFactor));
    }
    // Guantes, film, papel transfer: se gastan igual en un tatuaje chico que
    // en uno grande, pero una vez por sesión.
    case 'sesion':
      return round3(rate * sessionsCount);
    // Gasas, alcohol, toalla: acompañan el tiempo que dure el trabajo.
    case 'hora':
      return round3(rate * hours);
    default:
      return 0;
  }
}

/**
 * Cotiza un trabajo contra el inventario del artista.
 *
 * @param {object} params
 * @param {number} params.widthCm      ancho real sobre la piel
 * @param {number} params.heightCm     alto real sobre la piel
 * @param {number} params.inkRatio     cobertura de tinta (0–1]
 * @param {string} params.stroke       'fino' | 'medio' | 'grueso'
 * @param {string} params.colorMode    'negro' | 'grises' | 'color'
 * @param {number} [params.sessionsCount]  sesiones ya acordadas; si no va, se
 *   deducen del trabajo que pide la pieza
 * @param {Array}  params.materials    insumos del usuario (filas de `materials`)
 * @param {Array}  [params.palette]    colores del boceto `[{ hex, share }]`
 * @returns {{ effectiveArea, estimatedMinutes, materialsCost, items, missingInks }}
 */
function computeQuote({
  widthCm,
  heightCm,
  inkRatio,
  stroke = 'medio',
  colorMode = 'negro',
  sessionsCount,
  materials = [],
  palette = null,
}) {
  const strokeFactor = STROKE[stroke] ?? STROKE.medio;
  const colorFactor = COLOR[colorMode] ?? COLOR.negro;

  const boundingArea = widthCm * heightCm;
  const effectiveArea = round3(boundingArea * inkRatio);

  // Horas de aguja: el área que hay que entintar dividida por el rendimiento,
  // corregida por trazo y color. Es trabajo del proyecto COMPLETO y no se
  // multiplica por sesiones — repartir la misma pieza en más citas no agranda
  // el tatuaje.
  const workHours = (effectiveArea / CM2_POR_HORA) * strokeFactor.time * colorFactor.time;

  // Cuántas citas hace falta para ese trabajo. Se deduce en vez de preguntarse,
  // porque es consecuencia del tamaño de la pieza, no una decisión aparte: el
  // artista igual puede fijarla si ya la acordó con el cliente.
  const sessions = Math.min(
    MAX_SESIONES,
    Math.max(1, sessionsCount ?? Math.ceil(workHours / HORAS_POR_SESION))
  );

  // Al trabajo se le suma la preparación de cada cita, que es donde se va el
  // tiempo de una pieza chica y lo que explica por qué nunca es tan rápida
  // como sugeriría su área.
  const rawMinutes = workHours * 60 + MINUTOS_PREPARACION * sessions;
  const totalMinutes = Math.max(
    MIN_MINUTOS,
    Math.round(rawMinutes / BLOQUE_MINUTOS) * BLOQUE_MINUTOS
  );
  const hours = totalMinutes / 60;

  const materialFactor = strokeFactor.material * colorFactor.material;

  // Reparto del área entre las tintas que el diseño lleva de verdad. Solo
  // participan los insumos con color declarado; el resto se cotiza por el área
  // completa, como siempre.
  //
  // La regla que no se puede romper: las partes suman 1. El área entintada se
  // REPARTE entre las tintas, nunca se multiplica por cuántas haya guardadas.
  //
  // Con paleta medida el reparto es exacto. Sin ella se usa el modo de color
  // que eligió el artista, que es la única información de color disponible —
  // ignorarla era lo que hacía que un tatuaje "solo negro" cotizara tinta roja
  // y amarilla.
  // Dos listas, porque son dos preguntas distintas:
  //   cotizables → tinta con color Y con regla de consumo por área: son las
  //                que pueden recibir parte del diseño y convertirla en pesos
  //   declaradas → cualquier tinta con color, tenga regla o no
  const cotizables = materials.filter((m) => isInk(m) && m.color_hex);
  const declaradas = materials.filter((m) => m.color_hex);

  const reparto =
    palette?.length && cotizables.length
      ? allocatePalette(palette, cotizables)
      : allocateByMode(materials, colorMode);

  const shares = reparto.shares;
  // Un color que ninguna tinta cotizable cubre, pero que sí cubre alguna que el
  // artista tiene sin regla, no es una tinta faltante: la tiene, lo que falta
  // es decirle al sistema cuánto se gasta. No se cobra, pero tampoco se avisa
  // de ir a comprarla.
  const missing =
    declaradas.length > cotizables.length
      ? reparto.missing.filter((m) => !coversColor(m.hex, declaradas))
      : reparto.missing;

  const items = [];
  let materialsCost = 0;

  for (const material of materials) {
    // Las tintas reciben su parte del diseño; una que no se usa no se cotiza.
    // Lo demás (cartuchos, guantes) va por el área completa: una aguja no
    // distingue de qué color es el trazo que está haciendo.
    let share = 1;
    if (isInk(material)) {
      share = shares.get(material.id) ?? 0;
      if (share <= 0) continue;
    }

    const quantity = consumption(material, {
      effectiveArea,
      sessionsCount: sessions,
      hours,
      materialFactor,
      share,
    });
    if (quantity <= 0) continue;

    // El costo se cierra en pesos enteros aquí; la cantidad se guarda con
    // decimales para no inflar medio rollo de film a un rollo completo.
    const subtotal = Math.round(quantity * material.unit_cost);

    items.push({
      materialId: material.id,
      name: material.name,
      unit: material.unit,
      quantity,
      unitCost: material.unit_cost,
      subtotal,
      source: 'calculado',
    });
    materialsCost += subtotal;
  }

  // Colores del diseño que el inventario no cubre. Antes solo se avisaban y
  // esa parte quedaba fuera del costo, así que un dibujo a color cotizaba solo
  // el negro. El tatuaje necesita esa tinta igual: se cotiza con la tinta de
  // referencia más parecida, marcada como que hay que comprarla
  // (`materialId: null`, así tampoco intenta descontar un stock que no existe).
  // Sigue siendo un reparto: cada color entra con su parte del área, una vez.
  const porComprar = new Map();
  for (const color of missing) {
    const tinta = suggestInk(color.hex);
    if (!tinta) continue;
    color.suggestion = tinta.name;
    const previo = porComprar.get(tinta.name) ?? { tinta, share: 0 };
    previo.share += color.share;
    porComprar.set(tinta.name, previo);
  }
  for (const { tinta, share } of porComprar.values()) {
    const quantity = round3(
      Math.max(sessions, tinta.rate * effectiveArea * share * materialFactor)
    );
    const subtotal = Math.round(quantity * tinta.unitCost);
    items.push({
      materialId: null,
      name: `${tinta.name} (por comprar)`,
      unit: 'ml',
      quantity,
      unitCost: tinta.unitCost,
      subtotal,
      source: 'calculado',
    });
    materialsCost += subtotal;
  }

  // Lo más caro arriba: es donde el artista mira primero para ajustar (HU15).
  items.sort((a, b) => b.subtotal - a.subtotal);

  return {
    boundingArea: round3(boundingArea),
    effectiveArea,
    estimatedMinutes: totalMinutes,
    // Cuántas citas salen del cálculo, para que el formulario lo muestre y la
    // agenda pueda prellenarlas.
    sessionsCount: sessions,
    workMinutes: Math.round(workHours * 60),
    materialsCost,
    items,
    // Colores del diseño sin tinta equivalente en el inventario. No se
    // reparten entre las tintas que sí hay: cada uno trae en `suggestion` la
    // tinta de referencia con la que se cotizó y que habría que comprar.
    missingInks: missing,
  };
}

/** Suma de las líneas de una cotización, en pesos enteros. */
const itemsCost = (items) =>
  items.reduce((total, item) => total + Math.round(item.quantity * item.unitCost), 0);

module.exports = {
  computeQuote,
  itemsCost,
  STROKE,
  COLOR,
  STROKES,
  COLOR_MODES,
  BASES,
  CM2_POR_HORA,
  MINUTOS_PREPARACION,
  HORAS_POR_SESION,
  COBERTURA_POR_DEFECTO,
};
