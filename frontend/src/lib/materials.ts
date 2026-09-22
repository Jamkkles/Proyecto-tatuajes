import { apiFetch } from './api'

/**
 * Inventario de insumos (HU11–HU13): lo que se consume tatuando.
 *
 * `unit` dice en qué se cuenta el insumo y `quantity` va en enteros de esa
 * unidad. `min_quantity` es el nivel crítico: al llegar ahí hay que reponer.
 * `unit_cost` está en pesos enteros y será la base del cálculo de
 * cotizaciones (HU14).
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
}

export const MATERIAL_PRESETS: MaterialPreset[] = [
  // Agujas y cartuchos
  { name: 'Cartuchos round liner 03 (RL)', category: 'agujas', unit: 'caja', minQuantity: 1 },
  { name: 'Cartuchos round liner 05 (RL)', category: 'agujas', unit: 'caja', minQuantity: 1 },
  { name: 'Cartuchos round shader 07 (RS)', category: 'agujas', unit: 'caja', minQuantity: 1 },
  { name: 'Cartuchos magnum 09 (M1)', category: 'agujas', unit: 'caja', minQuantity: 1 },
  { name: 'Cartuchos magnum 15 (M1)', category: 'agujas', unit: 'caja', minQuantity: 1 },
  { name: 'Cartuchos curved magnum 13', category: 'agujas', unit: 'caja', minQuantity: 1 },
  { name: 'Agujas sueltas 1207RL', category: 'agujas', unit: 'unidad', minQuantity: 10 },

  // Tintas
  { name: 'Tinta negra 30 ml', category: 'tintas', unit: 'ml', minQuantity: 30 },
  { name: 'Tinta blanca 30 ml', category: 'tintas', unit: 'ml', minQuantity: 15 },
  { name: 'Tinta roja 15 ml', category: 'tintas', unit: 'ml', minQuantity: 10 },
  { name: 'Set de grises (wash)', category: 'tintas', unit: 'set', minQuantity: 1 },
  { name: 'Copitas de tinta', category: 'tintas', unit: 'unidad', minQuantity: 50 },

  // Barrera y protección
  { name: 'Guantes de nitrilo', category: 'proteccion', unit: 'par', minQuantity: 20 },
  { name: 'Mascarillas desechables', category: 'proteccion', unit: 'unidad', minQuantity: 20 },
  { name: 'Film transparente (barrera)', category: 'proteccion', unit: 'rollo', minQuantity: 1 },
  { name: 'Fundas para máquina', category: 'proteccion', unit: 'unidad', minQuantity: 20 },
  { name: 'Fundas para clip cord', category: 'proteccion', unit: 'unidad', minQuantity: 20 },
  { name: 'Grips desechables', category: 'proteccion', unit: 'unidad', minQuantity: 10 },

  // Higiene y limpieza
  { name: 'Jabón verde', category: 'higiene', unit: 'ml', minQuantity: 250 },
  { name: 'Alcohol isopropílico', category: 'higiene', unit: 'ml', minQuantity: 250 },
  { name: 'Agua destilada', category: 'higiene', unit: 'ml', minQuantity: 500 },
  { name: 'Gasas estériles', category: 'higiene', unit: 'unidad', minQuantity: 30 },
  { name: 'Toalla de papel', category: 'higiene', unit: 'rollo', minQuantity: 2 },
  { name: 'Rasuradoras desechables', category: 'higiene', unit: 'unidad', minQuantity: 10 },

  // Transfer y papelería
  { name: 'Papel hectográfico (transfer)', category: 'papeleria', unit: 'hoja', minQuantity: 20 },
  { name: 'Papel térmico para impresora', category: 'papeleria', unit: 'hoja', minQuantity: 20 },
  { name: 'Lápiz dermográfico', category: 'papeleria', unit: 'unidad', minQuantity: 2 },
  { name: 'Gel transfer (stencil)', category: 'papeleria', unit: 'ml', minQuantity: 100 },

  // Cuidado posterior
  { name: 'Vaselina / pomada', category: 'cuidado', unit: 'unidad', minQuantity: 2 },
  { name: 'Segunda piel (film curativo)', category: 'cuidado', unit: 'metro', minQuantity: 2 },
  { name: 'Film post tatuaje', category: 'cuidado', unit: 'rollo', minQuantity: 1 },

  // Máquinas y equipo
  { name: 'Máquina rotativa', category: 'maquinas', unit: 'unidad', minQuantity: 1 },
  { name: 'Fuente de poder', category: 'maquinas', unit: 'unidad', minQuantity: 1 },
  { name: 'Pedal', category: 'maquinas', unit: 'unidad', minQuantity: 1 },
  { name: 'Clip cord / cable RCA', category: 'maquinas', unit: 'unidad', minQuantity: 1 },

  // Otros
  { name: 'Contenedor de cortopunzantes', category: 'otros', unit: 'unidad', minQuantity: 1 },
  { name: 'Bolsas de desecho', category: 'otros', unit: 'unidad', minQuantity: 10 },
]
