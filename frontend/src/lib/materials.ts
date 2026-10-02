import { apiFetch } from './api'

/**
 * Inventario de insumos (HU11–HU13): lo que se consume tatuando.
 *
 * `unit` dice en qué se cuenta el insumo y `quantity` va en enteros de esa
 * unidad. `min_quantity` es el nivel crítico: al llegar ahí hay que reponer.
 * `unit_cost` está en pesos enteros y es la base del cálculo de cotizaciones
 * (HU14).
 *
 * `consumption_basis` y `consumption_rate` son lo que conecta el inventario
 * con el cotizador: dicen cómo se gasta cada insumo. Un insumo sin regla
 * simplemente no aparece en las cotizaciones.
 */

export type MaterialCategory =
  | 'agujas'
  | 'tintas'
  | 'proteccion'
  | 'higiene'
  | 'papeleria'
  | 'cuidado'
  | 'maquinas'
  | 'otros'

export type MaterialUnit = 'unidad' | 'caja' | 'par' | 'ml' | 'rollo' | 'hoja' | 'metro' | 'set'

/**
 * Cómo escala el gasto de un insumo al cotizar (HU14).
 *
 *   area    → con el tamaño entintado del tatuaje (tintas, cartuchos)
 *   sesion  → fijo cada vez que se trabaja (guantes, film, transfer)
 *   hora    → con lo que dure la sesión (gasas, alcohol, toalla)
 *   ninguno → no se consume tatuando (la máquina, el pedal, la fuente)
 */
export type ConsumptionBasis = 'area' | 'sesion' | 'hora' | 'ninguno'

export const CONSUMPTION_BASES: {
  value: ConsumptionBasis
  label: string
  /** Rótulo de la tasa en el formulario: "por cm² tatuado". */
  per: string
  hint: string
}[] = [
  { value: 'ninguno', label: 'No se consume', per: '', hint: 'No entra en las cotizaciones' },
  { value: 'area', label: 'Según el tamaño', per: 'por cm² tatuado', hint: 'Tintas, cartuchos' },
  { value: 'sesion', label: 'Por sesión', per: 'por sesión', hint: 'Guantes, film, transfer' },
  { value: 'hora', label: 'Por hora', per: 'por hora', hint: 'Gasas, alcohol, toalla' },
]

export const basisLabel = (value: ConsumptionBasis) =>
  CONSUMPTION_BASES.find((b) => b.value === value)?.label ?? value

export const basisPer = (value: ConsumptionBasis) =>
  CONSUMPTION_BASES.find((b) => b.value === value)?.per ?? ''

export const MATERIAL_CATEGORIES: { value: MaterialCategory; label: string }[] = [
  { value: 'agujas', label: 'Agujas y cartuchos' },
  { value: 'tintas', label: 'Tintas' },
  { value: 'proteccion', label: 'Barrera y protección' },
  { value: 'higiene', label: 'Higiene y limpieza' },
  { value: 'papeleria', label: 'Transfer y papelería' },
  { value: 'cuidado', label: 'Cuidado posterior' },
  { value: 'maquinas', label: 'Máquinas y equipo' },
  { value: 'otros', label: 'Otros' },
]

// `one` / `many`: el rótulo corto junto a la cantidad ("1 caja", "3 cajas").
export const MATERIAL_UNITS: { value: MaterialUnit; label: string; one: string; many: string }[] = [
  { value: 'unidad', label: 'Unidades', one: 'u.', many: 'u.' },
  { value: 'caja', label: 'Cajas', one: 'caja', many: 'cajas' },
  { value: 'par', label: 'Pares', one: 'par', many: 'pares' },
  { value: 'ml', label: 'Mililitros', one: 'ml', many: 'ml' },
  { value: 'rollo', label: 'Rollos', one: 'rollo', many: 'rollos' },
  { value: 'hoja', label: 'Hojas', one: 'hoja', many: 'hojas' },
  { value: 'metro', label: 'Metros', one: 'm', many: 'm' },
  { value: 'set', label: 'Sets', one: 'set', many: 'sets' },
]

export const categoryLabel = (value: MaterialCategory) =>
  MATERIAL_CATEGORIES.find((c) => c.value === value)?.label ?? value

/** Rótulo corto de la unidad, en singular o plural según la cantidad. */
export function unitShort(value: MaterialUnit, quantity = 2) {
  const unit = MATERIAL_UNITS.find((u) => u.value === value)
  if (!unit) return value
  return quantity === 1 ? unit.one : unit.many
}

export interface Material {
  id: string
  user_id: string
  name: string
  category: MaterialCategory
  unit: MaterialUnit
  quantity: number
  /** Nivel crítico: al llegar o bajar de aquí, se avisa (HU13). */
  min_quantity: number
  unit_cost: number
  consumption_basis: ConsumptionBasis
  /** Unidades del insumo por cada unidad de la base. Llega como número. */
  consumption_rate: number
  /**
   * Color de la tinta en `#rrggbb`, para emparejarla con la paleta del boceto
   * (HU14). Solo tiene sentido en la categoría `tintas`; el resto lo deja null
   * y se cotiza por el área completa.
   */
  color_hex: string | null
  supplier: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface MaterialInput {
  name: string
  category?: MaterialCategory
  unit?: MaterialUnit
  quantity?: number
  minQuantity?: number
  unitCost?: number
  consumptionBasis?: ConsumptionBasis
  consumptionRate?: number
  colorHex?: string | null
  supplier?: string | null
  notes?: string | null
}

export interface MaterialFilters {
  category?: MaterialCategory
  q?: string
  low?: boolean
}

export function listMaterials(filters: MaterialFilters = {}): Promise<Material[]> {
  const params = new URLSearchParams()
  if (filters.category) params.set('category', filters.category)
  if (filters.q?.trim()) params.set('q', filters.q.trim())
  if (filters.low) params.set('low', 'true')

  const query = params.toString()
  return apiFetch<{ materials: Material[] }>(`/api/materials${query ? `?${query}` : ''}`).then(
    (r) => r.materials,
  )
}

export function createMaterial(input: MaterialInput): Promise<Material> {
  return apiFetch<{ material: Material }>('/api/materials', {
    method: 'POST',
    body: JSON.stringify(input),
  }).then((r) => r.material)
}

export function updateMaterial(id: string, input: Partial<MaterialInput>): Promise<Material> {
  return apiFetch<{ material: Material }>(`/api/materials/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  }).then((r) => r.material)
}

/** Suma (o descuenta, con delta negativo) stock. El backend nunca baja de 0. */
export function adjustStock(id: string, delta: number): Promise<Material> {
  return apiFetch<{ material: Material }>(`/api/materials/${id}/stock`, {
    method: 'POST',
    body: JSON.stringify({ delta }),
  }).then((r) => r.material)
}

export function deleteMaterial(id: string): Promise<void> {
  return apiFetch<void>(`/api/materials/${id}`, { method: 'DELETE' })
}

/** ¿Llegó al nivel crítico? Misma regla que usa el backend para ordenar. */
export const isLowStock = (m: Material) => m.quantity <= m.min_quantity

/** Cuánto vale lo que queda de ese insumo. */
export const stockValue = (m: Material) => m.quantity * m.unit_cost

/** ¿Participa de las cotizaciones? (HU14) */
export const isConsumable = (m: Material) =>
  m.consumption_basis !== 'ninguno' && Number(m.consumption_rate) > 0

/**
 * Muestra la tasa sin notación científica ni ceros de relleno:
 * 0,015 → "0,015" y 3 → "3". El backend la devuelve como NUMERIC(12,5), que
 * en JSON llega con cinco decimales.
 */
export const formatRate = (rate: number) =>
  Number(rate).toLocaleString('es-CL', { maximumFractionDigits: 5 })

/**
 * Insumos típicos de un estudio de tatuajes, para cargarlos con un clic en vez
 * de escribirlos. Solo sugieren nombre, categoría, unidad y un nivel crítico
 * razonable: la cantidad y el costo los pone el artista.
 */
export interface MaterialPreset {
  name: string
  category: MaterialCategory
  unit: MaterialUnit
  minQuantity: number
  /** Color sugerido de la tinta. Solo lo traen los insumos de esa categoría. */
  colorHex?: string
  /** Regla de consumo sugerida para el cotizador (HU14). */
  basis: ConsumptionBasis
  /**
   * Tasa sugerida, en unidades del insumo por unidad de la base. Son valores
   * de partida para calibrar con la experiencia del artista, no verdades
   * fijas: cada estilo gasta distinto y se editan desde el inventario.
   */
  rate: number
  /**
   * Precio referencial en pesos chilenos, **por unidad de conteo** (por ml, por
   * par, por hoja…), no por envase.
   *
   * Esa distinción es la que más se presta a confusión: un frasco de 30 ml a
   * $18.000 son $600 por ml, no $18.000. Cargar el precio del envase multiplica
   * la cotización por el contenido entero.
   *
   * Referencias tomadas de Mercado Libre Chile en septiembre de 2026; donde no
   * había publicación clara se usó un estimado del rubro. Son un punto de
   * partida para no arrancar de cero: cada estudio compra a su proveedor y los
   * precios se editan desde el inventario.
   */
  unitCost: number
}

export const MATERIAL_PRESETS: MaterialPreset[] = [
  // Agujas y cartuchos
  { name: 'Cartuchos round liner 03 (RL)', category: 'agujas', unit: 'unidad', minQuantity: 10, basis: 'area', rate: 0.015, unitCost: 1000 },
  { name: 'Cartuchos round liner 05 (RL)', category: 'agujas', unit: 'unidad', minQuantity: 10, basis: 'area', rate: 0.01, unitCost: 1000 },
  { name: 'Cartuchos round shader 07 (RS)', category: 'agujas', unit: 'unidad', minQuantity: 10, basis: 'area', rate: 0.012, unitCost: 1000 },
  { name: 'Cartuchos magnum 09 (M1)', category: 'agujas', unit: 'unidad', minQuantity: 10, basis: 'area', rate: 0.01, unitCost: 1100 },
  { name: 'Cartuchos magnum 15 (M1)', category: 'agujas', unit: 'unidad', minQuantity: 10, basis: 'area', rate: 0.008, unitCost: 1200 },
  { name: 'Cartuchos curved magnum 13', category: 'agujas', unit: 'unidad', minQuantity: 10, basis: 'area', rate: 0.008, unitCost: 1200 },
  { name: 'Agujas sueltas 1207RL', category: 'agujas', unit: 'unidad', minQuantity: 10, basis: 'area', rate: 0.015, unitCost: 500 },

  // Tintas
  { name: 'Tinta negra 30 ml', colorHex: '#111111', category: 'tintas', unit: 'ml', minQuantity: 30, basis: 'area', rate: 0.05, unitCost: 600 },
  { name: 'Tinta blanca 30 ml', colorHex: '#fafafa', category: 'tintas', unit: 'ml', minQuantity: 15, basis: 'area', rate: 0.008, unitCost: 650 },
  { name: 'Tinta roja 15 ml', colorHex: '#c0392b', category: 'tintas', unit: 'ml', minQuantity: 10, basis: 'area', rate: 0.01, unitCost: 760 },
  { name: 'Set de grises (wash)', category: 'tintas', unit: 'set', minQuantity: 1, basis: 'ninguno', rate: 0, unitCost: 35000 },
  { name: 'Tinta azul 15 ml', colorHex: '#2255aa', category: 'tintas', unit: 'ml', minQuantity: 10, basis: 'area', rate: 0.01, unitCost: 760 },
  { name: 'Tinta verde 15 ml', colorHex: '#2e8b57', category: 'tintas', unit: 'ml', minQuantity: 10, basis: 'area', rate: 0.01, unitCost: 760 },
  { name: 'Tinta amarilla 15 ml', colorHex: '#e6b800', category: 'tintas', unit: 'ml', minQuantity: 10, basis: 'area', rate: 0.01, unitCost: 760 },
  { name: 'Tinta naranja 15 ml', colorHex: '#e07b2a', category: 'tintas', unit: 'ml', minQuantity: 10, basis: 'area', rate: 0.01, unitCost: 760 },
  { name: 'Tinta morada 15 ml', colorHex: '#8e44ad', category: 'tintas', unit: 'ml', minQuantity: 10, basis: 'area', rate: 0.01, unitCost: 760 },
  { name: 'Copitas de tinta', category: 'tintas', unit: 'unidad', minQuantity: 50, basis: 'sesion', rate: 4, unitCost: 40 },

  // Barrera y protección
  { name: 'Guantes de nitrilo', category: 'proteccion', unit: 'par', minQuantity: 20, basis: 'sesion', rate: 3, unitCost: 80 },
  { name: 'Mascarillas desechables', category: 'proteccion', unit: 'unidad', minQuantity: 20, basis: 'sesion', rate: 1, unitCost: 60 },
  { name: 'Film transparente (barrera)', category: 'proteccion', unit: 'rollo', minQuantity: 1, basis: 'sesion', rate: 0.05, unitCost: 5000 },
  { name: 'Fundas para máquina', category: 'proteccion', unit: 'unidad', minQuantity: 20, basis: 'sesion', rate: 2, unitCost: 60 },
  { name: 'Fundas para clip cord', category: 'proteccion', unit: 'unidad', minQuantity: 20, basis: 'sesion', rate: 2, unitCost: 180 },
  { name: 'Grips desechables', category: 'proteccion', unit: 'unidad', minQuantity: 10, basis: 'sesion', rate: 1, unitCost: 1500 },

  // Higiene y limpieza
  { name: 'Jabón verde', category: 'higiene', unit: 'ml', minQuantity: 250, basis: 'hora', rate: 25, unitCost: 18 },
  { name: 'Alcohol isopropílico', category: 'higiene', unit: 'ml', minQuantity: 250, basis: 'hora', rate: 15, unitCost: 6 },
  { name: 'Agua destilada', category: 'higiene', unit: 'ml', minQuantity: 500, basis: 'hora', rate: 20, unitCost: 2 },
  { name: 'Gasas estériles', category: 'higiene', unit: 'unidad', minQuantity: 30, basis: 'hora', rate: 4, unitCost: 50 },
  { name: 'Toalla de papel', category: 'higiene', unit: 'rollo', minQuantity: 2, basis: 'sesion', rate: 0.15, unitCost: 1500 },
  { name: 'Rasuradoras desechables', category: 'higiene', unit: 'unidad', minQuantity: 10, basis: 'sesion', rate: 1, unitCost: 250 },

  // Transfer y papelería
  { name: 'Papel hectográfico (transfer)', category: 'papeleria', unit: 'hoja', minQuantity: 20, basis: 'sesion', rate: 1, unitCost: 1000 },
  { name: 'Papel térmico para impresora', category: 'papeleria', unit: 'hoja', minQuantity: 20, basis: 'sesion', rate: 1, unitCost: 800 },
  { name: 'Lápiz dermográfico', category: 'papeleria', unit: 'unidad', minQuantity: 2, basis: 'sesion', rate: 0.05, unitCost: 2500 },
  { name: 'Gel transfer (stencil)', category: 'papeleria', unit: 'ml', minQuantity: 100, basis: 'sesion', rate: 5, unitCost: 48 },

  // Cuidado posterior
  { name: 'Vaselina / pomada', category: 'cuidado', unit: 'unidad', minQuantity: 2, basis: 'sesion', rate: 0.1, unitCost: 4000 },
  { name: 'Segunda piel (film curativo)', category: 'cuidado', unit: 'metro', minQuantity: 2, basis: 'sesion', rate: 0.3, unitCost: 2000 },
  { name: 'Film post tatuaje', category: 'cuidado', unit: 'rollo', minQuantity: 1, basis: 'sesion', rate: 0.05, unitCost: 5000 },

  // Máquinas y equipo
  { name: 'Máquina rotativa', category: 'maquinas', unit: 'unidad', minQuantity: 1, basis: 'ninguno', rate: 0, unitCost: 120000 },
  { name: 'Fuente de poder', category: 'maquinas', unit: 'unidad', minQuantity: 1, basis: 'ninguno', rate: 0, unitCost: 70000 },
  { name: 'Pedal', category: 'maquinas', unit: 'unidad', minQuantity: 1, basis: 'ninguno', rate: 0, unitCost: 15000 },
  { name: 'Clip cord / cable RCA', category: 'maquinas', unit: 'unidad', minQuantity: 1, basis: 'ninguno', rate: 0, unitCost: 8000 },

  // Otros
  { name: 'Contenedor de cortopunzantes', category: 'otros', unit: 'unidad', minQuantity: 1, basis: 'sesion', rate: 0.02, unitCost: 6000 },
  { name: 'Bolsas de desecho', category: 'otros', unit: 'unidad', minQuantity: 10, basis: 'sesion', rate: 1, unitCost: 100 },
]
