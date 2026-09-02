import { apiFetch } from './api'

/**
 * Escenas de previsualización 3D: un modelo de cuerpo, un encuadre de cámara y
 * los tatuajes colocados encima.
 *
 * Se guarda la RECETA (posición, rotación y tamaño de cada calca), no los
 * píxeles: así el día que se cambie la técnica de proyección los datos siguen
 * sirviendo. La rotación va como cuaternión porque el Euler necesita un orden
 * explícito para ir y volver sin perder información.
 */

export interface PreviewCamera {
  position: [number, number, number]
  target: [number, number, number]
}

export interface PreviewPlacement {
  /** Boceto de la galería. Un archivo local no se puede guardar. */
  sketchId: string
  position: [number, number, number]
  quaternion: [number, number, number, number]
  /** Ancho, alto y profundidad del proyector, en metros. */
  size: [number, number, number]
  /** Ancla para recolocar si cambiara la malla del modelo. */
  anchor: { faceIndex: number | null; uv: [number, number] | null } | null
  render: { order: number; opacity: number; flipX: boolean }
}

export interface Preview {
  id: string
  user_id: string
  name: string
  model_id: string
  camera: PreviewCamera | null
  placements: PreviewPlacement[]
  created_at: string
  updated_at: string
}

export interface PreviewInput {
  name: string
  modelId: string
  camera: PreviewCamera | null
  placements: PreviewPlacement[]
}

export function listPreviews(): Promise<Preview[]> {
  return apiFetch<{ previews: Preview[] }>('/api/previews').then((r) => r.previews)
}

export function getPreview(id: string): Promise<Preview> {
  return apiFetch<{ preview: Preview }>(`/api/previews/${id}`).then((r) => r.preview)
}

export function createPreview(input: PreviewInput): Promise<Preview> {
  return apiFetch<{ preview: Preview }>('/api/previews', {
    method: 'POST',
    body: JSON.stringify(input),
  }).then((r) => r.preview)
}

export function updatePreview(id: string, input: Partial<PreviewInput>): Promise<Preview> {
  return apiFetch<{ preview: Preview }>(`/api/previews/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  }).then((r) => r.preview)
}

export function deletePreview(id: string): Promise<void> {
  return apiFetch<void>(`/api/previews/${id}`, { method: 'DELETE' })
}
