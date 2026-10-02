import { apiFetch } from './api'
import type { PreviewPlacement } from './previews'
import type { Sketch } from './sketches'

/**
 * Cotizaciones automatizadas de insumos (HU14–HU16).
 *
 * El alcance del proyecto es explícito: esto calcula **costo de material**, no
 * el precio de venta. Lo que el artista cobra por su arte vive en el precio
 * del proyecto, no aquí.
 *
 * El cálculo lo hace el backend, siempre. La página solo manda los parámetros
 * y dibuja el resultado: el costo que se le muestra a un cliente no puede
 * depender de lo que calcule un navegador.
 */

/* ---------------- Parámetros del cálculo ---------------- */

/** Grosor del trazo: una de las "variables de trazado" de la HU14. */
export type Stroke = 'fino' | 'medio' | 'grueso'
export type ColorMode = 'negro' | 'grises' | 'color'
export type QuoteStatus = 'borrador' | 'aceptada' | 'descartada'
export type QuoteItemSource = 'calculado' | 'manual'

export const STROKES: { value: Stroke; label: string; hint: string }[] = [
  { value: 'fino', label: 'Fino', hint: 'Línea de detalle, fineline' },
  { value: 'medio', label: 'Medio', hint: 'Línea y relleno estándar' },
  { value: 'grueso', label: 'Grueso', hint: 'Trazo marcado, blackwork' },
]

export const COLOR_MODES: { value: ColorMode; label: string; hint: string }[] = [
  { value: 'negro', label: 'Solo negro', hint: 'Una tinta' },
  { value: 'grises', label: 'Negro y grises', hint: 'Degradados, sombras' },
  { value: 'color', label: 'Color', hint: 'Varias tintas, más pasadas' },
]

export const QUOTE_STATUSES: { value: QuoteStatus; label: string }[] = [
  { value: 'borrador', label: 'Borrador' },
  { value: 'aceptada', label: 'Aceptada' },
  { value: 'descartada', label: 'Descartada' },
]

export const strokeLabel = (v: Stroke) => STROKES.find((s) => s.value === v)?.label ?? v
export const colorModeLabel = (v: ColorMode) => COLOR_MODES.find((c) => c.value === v)?.label ?? v
export const quoteStatusLabel = (v: QuoteStatus) =>
  QUOTE_STATUSES.find((s) => s.value === v)?.label ?? v

/* ---------------- Tipos ---------------- */

export interface QuoteItem {
  id: string
  quote_id: string
  /** Null si el insumo se borró del inventario después de cotizar. */
  material_id: string | null
  name: string
  unit: string
  /** Puede traer decimales: medio rollo de film es un consumo real. */
  quantity: number
  unit_cost: number
  source: QuoteItemSource
  position: number
}

export interface Quote {
  id: string
  user_id: string
  project_id: string | null
  sketch_id: string | null
  session_id: string | null
  title: string
  width_cm: number
  height_cm: number
  ink_ratio: number
  stroke: Stroke
  color_mode: ColorMode
  sessions_count: number
  estimated_minutes: number
  materials_cost: number
  status: QuoteStatus
  /** HU16: cuándo descontó el stock. Una vez sellada ya no se puede editar. */
  consumed_at: string | null
  created_at: string
  updated_at: string
  // Resumen que arma el backend.
  project_title: string | null
  client_name: string | null
  sketch_title: string | null
  sketch_url: string | null
  items?: QuoteItem[]
}

/** Lo que se manda al backend para calcular o guardar. */
export interface QuoteParams {
  widthCm: number
  heightCm: number
  /** Si no va, el backend la toma del boceto enlazado. */
  inkRatio?: number
  stroke?: Stroke
  colorMode?: ColorMode
  /** Si no va, el backend las deduce del trabajo que pide la pieza. */
  sessionsCount?: number
  sketchId?: string | null
}

export interface QuoteItemInput {
  materialId: string | null
  name: string
  unit: string
  quantity: number
  unitCost: number
  source: QuoteItemSource
}

export interface QuoteInput extends QuoteParams {
  title: string
  projectId?: string | null
  sessionId?: string | null
  status?: QuoteStatus
  estimatedMinutes?: number
  items?: QuoteItemInput[]
}

/** Línea calculada por el motor, antes de guardarse. */
export interface EstimateItem {
  /** `null` en las tintas que el diseño pide y no están en el inventario. */
  materialId: string | null
  name: string
  unit: string
  quantity: number
  unitCost: number
  subtotal: number
  source: QuoteItemSource
}

/** Un color del diseño sin tinta equivalente en el inventario. */
export interface MissingInk {
  hex: string
  /** Qué parte del área entintada necesita ese color. */
  share: number
  /** Tinta de referencia con la que se cotizó: la que habría que comprar. */
  suggestion?: string
}

export interface Estimate {
  /** Ancho × alto, sin ponderar. */
  boundingArea: number
  /** Lo anterior por la cobertura de tinta: lo que de verdad se tatúa. */
  effectiveArea: number
  /** Tiempo total: aguja más la preparación de cada sesión. */
  estimatedMinutes: number
  /** Solo las horas de aguja, sin preparación. Es el trabajo del tatuaje. */
  workMinutes: number
  /** Citas que pide el trabajo. Deducidas, salvo que el artista las fije. */
  sessionsCount: number
  materialsCost: number
  items: EstimateItem[]
  /** La cobertura que se usó, venga del boceto o del valor por defecto. */
  inkRatio: number
  /**
   * Colores del diseño para los que no hay tinta en el inventario. Su parte
   * del área **no** se reparte entre las tintas que sí hay: se cotiza con una
   * tinta de referencia (`suggestion`), que sale en `items` sin `materialId`
   * porque hay que comprarla.
   */
  missingInks: MissingInk[]
}

/* ---------------- API ---------------- */

/** Calcula sin guardar: es lo que se llama mientras el artista ajusta. */
export function estimateQuote(
  params: QuoteParams,
): Promise<{ estimate: Estimate; consumableCount: number }> {
  return apiFetch<{ estimate: Estimate; consumableCount: number }>('/api/quotes/estimate', {
    method: 'POST',
    body: JSON.stringify(params),
  })
}

export function listQuotes(projectId?: string): Promise<Quote[]> {
  const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''
  return apiFetch<{ quotes: Quote[] }>(`/api/quotes${query}`).then((r) => r.quotes)
}

export function getQuote(id: string): Promise<Quote> {
  return apiFetch<{ quote: Quote }>(`/api/quotes/${id}`).then((r) => r.quote)
}

export function createQuote(input: QuoteInput): Promise<Quote> {
  return apiFetch<{ quote: Quote }>('/api/quotes', {
    method: 'POST',
    body: JSON.stringify(input),
  }).then((r) => r.quote)
}

export function updateQuote(id: string, input: Partial<QuoteInput>): Promise<Quote> {
  return apiFetch<{ quote: Quote }>(`/api/quotes/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  }).then((r) => r.quote)
}

export function deleteQuote(id: string): Promise<void> {
  return apiFetch<void>(`/api/quotes/${id}`, { method: 'DELETE' })
}

/** Insumo descontado del inventario tras cerrar una sesión cotizada (HU16). */
export interface DiscountedMaterial {
  id: string
  name: string
  unit: string
  quantity: number
  min_quantity: number
  discounted: number
  /** Quedó en nivel crítico: hay que reponer (HU13). */
  low: boolean
}

export interface ConsumeResult {
  quote: Quote
  affected: DiscountedMaterial[]
}

/**
 * Descuenta el stock a mano. Normalmente no hace falta llamarla: cerrar la
 * sesión ya lo dispara solo.
 */
export function consumeQuote(id: string): Promise<ConsumeResult> {
  return apiFetch<ConsumeResult>(`/api/quotes/${id}/consume`, { method: 'POST' })
}

/* ---------------- Utilidades ---------------- */

export interface TattooSize {
  widthCm: number
  heightCm: number
}

/**
 * Tamaño real del tatuaje a partir de la escena 3D.
 *
 * El visor normaliza cada modelo a su alto humano real (`targetHeight` en
 * `bodyModels.ts`), así que el `size` de una calca ya está en metros de piel:
 * pasarlo a centímetros es toda la conversión que hace falta.
 *
 * `sketchId` elige qué calca medir. Si no se indica, o ese boceto no está en
 * la escena, se usa la única calca que haya: con una sola no hay ambigüedad.
 * Con varias y sin boceto que las desempate devuelve null, porque adivinar
 * cuál es "el" tatuaje del proyecto sería inventar.
 */
export function sizeFromPlacements(
  placements: PreviewPlacement[],
  sketchId?: string | null,
): TattooSize | null {
  const placement =
    (sketchId && placements.find((p) => p.sketchId === sketchId)) ||
    (placements.length === 1 ? placements[0] : null)
  if (!placement) return null

  // Un decimal basta: nadie mide un tatuaje en décimas de milímetro.
  const round = (m: number) => Math.round(m * 1000) / 10
  return { widthCm: round(placement.size[0]), heightCm: round(placement.size[1]) }
}

/** 4.528 → "4,53" · 3 → "3" (las cantidades enteras no llevan decimales). */
export function formatQuantity(quantity: number): string {
  return Number.isInteger(quantity)
    ? String(quantity)
    : quantity.toLocaleString('es-CL', { maximumFractionDigits: 2 })
}

/**
 * Deduce el modo de color a partir de la paleta medida del boceto.
 *
 * Es solo para prellenar el desplegable: el artista manda y puede cambiarlo.
 * El reparto de tintas no depende de esto — cuando hay paleta, el reparto se
 * hace con ella. Aquí el modo solo decide los multiplicadores de material y
 * tiempo, porque trabajar a color lleva más pasadas y más cambios de tinta.
 *
 * Los grises de un lineart limpio salen del suavizado de los bordes, no de un
 * sombreado buscado, así que el umbral para llamarlo "negro y grises" es alto:
 * un dragón a línea pura ronda el 24% de grises y debe leerse como negro.
 */
export function colorModeFromPalette(palette: Sketch['palette']): ColorMode | null {
  if (!palette?.length) return null

  let chromatic = 0
  let midGrey = 0
  for (const entry of palette) {
    const n = parseInt(entry.hex.replace('#', ''), 16)
    const r = (n >> 16) & 255
    const g = (n >> 8) & 255
    const b = n & 255
    const max = Math.max(r, g, b)
    const saturation = max === 0 ? 0 : (max - Math.min(r, g, b)) / max
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255

    if (saturation > 0.25) chromatic += entry.share
    else if (luminance > 0.18 && luminance < 0.9) midGrey += entry.share
  }

  if (chromatic >= 0.05) return 'color'
  return midGrey >= 0.3 ? 'grises' : 'negro'
}

/** 0.35 → "35%" */
export const formatCoverage = (ratio: number) => `${Math.round(ratio * 100)}%`

export const itemSubtotal = (item: { quantity: number; unit_cost: number }) =>
  Math.round(item.quantity * item.unit_cost)
