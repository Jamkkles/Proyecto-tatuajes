/**
 * Inventario inicial de cada artista: el catálogo completo de insumos típicos de
 * tatuaje, para no empezar con la pantalla vacía ni cargar cuarenta cosas una por
 * una. Quien no quiera alguno lo elimina (o los elimina todos).
 *
 * Es el mismo catálogo que `MATERIAL_PRESETS` (frontend/src/lib/materials.ts), el
 * selector «Insumos frecuentes». Viven aparte porque el frontend se compila solo y
 * no puede importar archivos del backend: si cambia un precio o una tasa en uno,
 * hay que cambiarlo en el otro.
 *
 * **Las variantes alternativas entran apagadas.** El cotizador cobra *todos* los
 * insumos con regla por tamaño que el artista tenga. Con las siete variantes de
 * cartucho activas, cada tatuaje cobraría siete agujas; con los dos papeles de
 * transfer, dos papeles. Por eso de cada familia intercambiable queda una activa
 * (un cartucho de línea y uno de sombreado, un papel, un film) y las demás se
 * cargan con «No se consume» y una nota que dice cómo encenderlas. Siguen en el
 * inventario con su stock y su precio, solo que no entran en las cotizaciones.
 * También van apagados los equipos (máquinas, fuente, pedal): no se gastan
 * tatuando.
 *
 * Precios en pesos chilenos **por unidad de conteo** (por ml, por par…), no por
 * envase. Son referenciales; cada estudio compra a su proveedor y los edita.
 */

/** Stock inicial de un insumo que se gasta: el doble del nivel crítico. */
const STOCK_FACTOR = 2;

const kit = (
  name,
  category,
  unit,
  minQuantity,
  basis,
  rate,
  unitCost,
  { colorHex = null, notes = null, quantity } = {}
) => ({
  name,
  category,
  unit,
  // El doble del nivel crítico, para que el inventario no arranque en alerta.
  quantity: quantity ?? minQuantity * STOCK_FACTOR,
  minQuantity,
  unitCost,
  consumptionBasis: basis,
  consumptionRate: rate,
  colorHex,
  notes,
});

/** Una máquina o accesorio: se tiene, no se gasta. Hay una, y no tiene mínimo. */
const equipo = (name, unit, unitCost, notes = null) =>
  kit(name, 'maquinas', unit, 0, 'ninguno', 0, unitCost, { quantity: 1, notes });

/**
 * Variante de una familia cuya hermana ya viene activa. Se carga apagada pero
 * conserva la tasa sugerida, que va escrita en la nota porque al guardar el
 * formulario de un insumo sin consumo la tasa se pone en cero.
 */
const alternativa = (name, category, unit, minQuantity, rate, unitCost, de, per) =>
  kit(name, category, unit, minQuantity, 'ninguno', rate, unitCost, {
    notes:
      `Alternativa a ${de}. Para no cobrar lo mismo dos veces, este no entra en las ` +
      'cotizaciones. Si es el que usas, elige «' +
      per.base +
      '» en «Se gasta» (tasa sugerida: ' +
      String(rate).replace('.', ',') +
      ' ' +
      per.unidad +
      ') y apaga el que reemplaza.',
  });

const AREA = { base: 'Según el tamaño', unidad: 'por cm² tatuado' };
const SESION = { base: 'Por sesión', unidad: 'por sesión' };

const CARTUCHOS_ACTIVOS = 'los cartuchos round liner 03 y magnum 09 (los que ya vienen activos)';

const DEFAULT_MATERIALS = [
  // Agujas y cartuchos
  kit('Cartuchos round liner 03 (RL)', 'agujas', 'unidad', 10, 'area', 0.015, 1000),
  alternativa('Cartuchos round liner 05 (RL)', 'agujas', 'unidad', 10, 0.01, 1000, CARTUCHOS_ACTIVOS, AREA),
  alternativa('Cartuchos round shader 07 (RS)', 'agujas', 'unidad', 10, 0.012, 1000, CARTUCHOS_ACTIVOS, AREA),
  kit('Cartuchos magnum 09 (M1)', 'agujas', 'unidad', 10, 'area', 0.01, 1100),
  alternativa('Cartuchos magnum 15 (M1)', 'agujas', 'unidad', 10, 0.008, 1200, CARTUCHOS_ACTIVOS, AREA),
  alternativa('Cartuchos curved magnum 13', 'agujas', 'unidad', 10, 0.008, 1200, CARTUCHOS_ACTIVOS, AREA),
  alternativa('Agujas sueltas 1207RL', 'agujas', 'unidad', 10, 0.015, 500, CARTUCHOS_ACTIVOS, AREA),

  // Tintas
  kit('Tinta negra 30 ml', 'tintas', 'ml', 30, 'area', 0.05, 600, { colorHex: '#111111' }),
  kit('Tinta blanca 30 ml', 'tintas', 'ml', 15, 'area', 0.008, 650, { colorHex: '#fafafa' }),
  kit('Tinta roja 15 ml', 'tintas', 'ml', 10, 'area', 0.01, 760, { colorHex: '#c0392b' }),
  kit('Tinta azul 15 ml', 'tintas', 'ml', 10, 'area', 0.01, 760, { colorHex: '#2255aa' }),
  kit('Tinta verde 15 ml', 'tintas', 'ml', 10, 'area', 0.01, 760, { colorHex: '#2e8b57' }),
  kit('Tinta amarilla 15 ml', 'tintas', 'ml', 10, 'area', 0.01, 760, { colorHex: '#e6b800' }),
  kit('Tinta naranja 15 ml', 'tintas', 'ml', 10, 'area', 0.01, 760, { colorHex: '#e07b2a' }),
  kit('Tinta morada 15 ml', 'tintas', 'ml', 10, 'area', 0.01, 760, { colorHex: '#8e44ad' }),
  kit('Set de grises (wash)', 'tintas', 'set', 0, 'ninguno', 0, 35000, {
    quantity: 1,
    notes:
      'Los grises se logran rebajando la tinta negra, así que las cotizaciones ya los ' +
      'cuentan como negro. Este set se lleva solo como stock.',
  }),
  kit('Copitas de tinta', 'tintas', 'unidad', 50, 'sesion', 4, 40),

  // Barrera y protección
  kit('Guantes de nitrilo', 'proteccion', 'par', 20, 'sesion', 3, 80),
  kit('Mascarillas desechables', 'proteccion', 'unidad', 20, 'sesion', 1, 60),
  kit('Film transparente (barrera)', 'proteccion', 'rollo', 1, 'sesion', 0.05, 5000),
  kit('Fundas para máquina', 'proteccion', 'unidad', 20, 'sesion', 2, 60),
  kit('Fundas para clip cord', 'proteccion', 'unidad', 20, 'sesion', 2, 180),
  kit('Grips desechables', 'proteccion', 'unidad', 10, 'ninguno', 1, 1500, {
    notes:
      'Depende de tu sistema de agujas: si usas grips desechables, elige «Por sesión» en ' +
      '«Se gasta» (tasa sugerida: 1 por sesión) para que entren en las cotizaciones.',
  }),

  // Higiene y limpieza
  kit('Jabón verde', 'higiene', 'ml', 250, 'hora', 25, 18),
  kit('Alcohol isopropílico', 'higiene', 'ml', 250, 'hora', 15, 6),
  kit('Agua destilada', 'higiene', 'ml', 500, 'hora', 20, 2),
  kit('Gasas estériles', 'higiene', 'unidad', 30, 'hora', 4, 50),
  kit('Toalla de papel', 'higiene', 'rollo', 2, 'sesion', 0.15, 1500),
  kit('Rasuradoras desechables', 'higiene', 'unidad', 10, 'sesion', 1, 250),

  // Transfer y papelería
  kit('Papel hectográfico (transfer)', 'papeleria', 'hoja', 20, 'sesion', 1, 1000),
  alternativa('Papel térmico para impresora', 'papeleria', 'hoja', 20, 1, 800, 'el papel hectográfico', SESION),
  kit('Lápiz dermográfico', 'papeleria', 'unidad', 2, 'sesion', 0.05, 2500),
  kit('Gel transfer (stencil)', 'papeleria', 'ml', 100, 'sesion', 5, 48),

  // Cuidado posterior
  kit('Vaselina / pomada', 'cuidado', 'unidad', 2, 'sesion', 0.1, 4000),
  kit('Segunda piel (film curativo)', 'cuidado', 'metro', 2, 'sesion', 0.3, 2000),
  alternativa('Film post tatuaje', 'cuidado', 'rollo', 1, 0.05, 5000, 'la segunda piel', SESION),

  // Máquinas y equipo
  equipo('Máquina rotativa', 'unidad', 120000),
  equipo('Fuente de poder', 'unidad', 70000),
  equipo('Pedal', 'unidad', 15000),
  equipo('Clip cord / cable RCA', 'unidad', 8000),

  // Otros
  kit('Contenedor de cortopunzantes', 'otros', 'unidad', 1, 'sesion', 0.02, 6000),
  kit('Bolsas de desecho', 'otros', 'unidad', 10, 'sesion', 1, 100),
];

module.exports = { DEFAULT_MATERIALS, STOCK_FACTOR };
