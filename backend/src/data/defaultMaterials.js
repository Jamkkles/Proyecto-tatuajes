/**
 * Kit básico de insumos que recibe cada artista al crear su cuenta, o cuando lo
 * pide desde el inventario. Para no empezar de cero: cargar uno por uno el
 * nombre, la unidad, la regla de consumo y el precio de unos treinta insumos es
 * lo más tedioso de arrancar.
 *
 * Es una copia depurada de `MATERIAL_PRESETS` (frontend/src/lib/materials.ts),
 * que es el catálogo del selector «Insumos frecuentes». Los dos viven aparte
 * porque el frontend se compila solo y no puede importar archivos del backend:
 * si cambia un precio o una tasa en uno, hay que cambiarlo en el otro.
 *
 * **Qué se deja fuera, y por qué.** El cotizador cobra *todos* los insumos con
 * regla por tamaño que el artista tenga. Con las siete variantes de cartucho,
 * una cotización cobraría siete agujas por tatuaje. Por eso el kit lleva una
 * variante de cada familia intercambiable y las demás quedan en el catálogo:
 *   - agujas: un cartucho de línea y uno de sombreado (se usan los dos),
 *   - papel de transfer: el hectográfico (el térmico es la alternativa),
 *   - film: el de barrera (el de post tatuaje cumple lo mismo),
 *   - sin grips desechables, que dependen del sistema de cartuchos de cada uno.
 * Tampoco van las máquinas, la fuente, el pedal ni el set de grises: no se
 * consumen tatuando, así que no son insumos ni entran en las cotizaciones.
 *
 * Precios en pesos chilenos **por unidad de conteo** (por ml, por par…), no por
 * envase. Son referenciales; cada estudio compra a su proveedor y los edita.
 */

/** Stock inicial: el doble del nivel crítico, para que nada salga en alerta. */
const STOCK_FACTOR = 2;

const kit = (name, category, unit, minQuantity, basis, rate, unitCost, colorHex = null) => ({
  name,
  category,
  unit,
  quantity: minQuantity * STOCK_FACTOR,
  minQuantity,
  unitCost,
  consumptionBasis: basis,
  consumptionRate: rate,
  colorHex,
});

const DEFAULT_MATERIALS = [
  // Agujas y cartuchos
  kit('Cartuchos round liner 03 (RL)', 'agujas', 'unidad', 10, 'area', 0.015, 1000),
  kit('Cartuchos magnum 09 (M1)', 'agujas', 'unidad', 10, 'area', 0.01, 1100),

  // Tintas
  kit('Tinta negra 30 ml', 'tintas', 'ml', 30, 'area', 0.05, 600, '#111111'),
  kit('Tinta blanca 30 ml', 'tintas', 'ml', 15, 'area', 0.008, 650, '#fafafa'),
  kit('Tinta roja 15 ml', 'tintas', 'ml', 10, 'area', 0.01, 760, '#c0392b'),
  kit('Tinta azul 15 ml', 'tintas', 'ml', 10, 'area', 0.01, 760, '#2255aa'),
  kit('Tinta verde 15 ml', 'tintas', 'ml', 10, 'area', 0.01, 760, '#2e8b57'),
  kit('Tinta amarilla 15 ml', 'tintas', 'ml', 10, 'area', 0.01, 760, '#e6b800'),
  kit('Tinta naranja 15 ml', 'tintas', 'ml', 10, 'area', 0.01, 760, '#e07b2a'),
  kit('Tinta morada 15 ml', 'tintas', 'ml', 10, 'area', 0.01, 760, '#8e44ad'),
  kit('Copitas de tinta', 'tintas', 'unidad', 50, 'sesion', 4, 40),

  // Barrera y protección
  kit('Guantes de nitrilo', 'proteccion', 'par', 20, 'sesion', 3, 80),
  kit('Mascarillas desechables', 'proteccion', 'unidad', 20, 'sesion', 1, 60),
  kit('Film transparente (barrera)', 'proteccion', 'rollo', 1, 'sesion', 0.05, 5000),
  kit('Fundas para máquina', 'proteccion', 'unidad', 20, 'sesion', 2, 60),
  kit('Fundas para clip cord', 'proteccion', 'unidad', 20, 'sesion', 2, 180),

  // Higiene y limpieza
  kit('Jabón verde', 'higiene', 'ml', 250, 'hora', 25, 18),
  kit('Alcohol isopropílico', 'higiene', 'ml', 250, 'hora', 15, 6),
  kit('Agua destilada', 'higiene', 'ml', 500, 'hora', 20, 2),
  kit('Gasas estériles', 'higiene', 'unidad', 30, 'hora', 4, 50),
  kit('Toalla de papel', 'higiene', 'rollo', 2, 'sesion', 0.15, 1500),
  kit('Rasuradoras desechables', 'higiene', 'unidad', 10, 'sesion', 1, 250),

  // Transfer y papelería
  kit('Papel hectográfico (transfer)', 'papeleria', 'hoja', 20, 'sesion', 1, 1000),
  kit('Lápiz dermográfico', 'papeleria', 'unidad', 2, 'sesion', 0.05, 2500),
  kit('Gel transfer (stencil)', 'papeleria', 'ml', 100, 'sesion', 5, 48),

  // Cuidado posterior
  kit('Vaselina / pomada', 'cuidado', 'unidad', 2, 'sesion', 0.1, 4000),
  kit('Segunda piel (film curativo)', 'cuidado', 'metro', 2, 'sesion', 0.3, 2000),

  // Otros
  kit('Contenedor de cortopunzantes', 'otros', 'unidad', 1, 'sesion', 0.02, 6000),
  kit('Bolsas de desecho', 'otros', 'unidad', 10, 'sesion', 1, 100),
];

module.exports = { DEFAULT_MATERIALS, STOCK_FACTOR };
