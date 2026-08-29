import { apiFetch } from './api'

/** Estados posibles de un boceto (mismo CHECK que la columna `status`). */
export type SketchStatus = 'disponible' | 'reservado' | 'tatuado'

export const SKETCH_STATUSES: { value: SketchStatus; label: string }[] = [
  { value: 'disponible', label: 'Disponible' },
  { value: 'reservado', label: 'Reservado' },
  { value: 'tatuado', label: 'Tatuado' },
]

export interface Sketch {
  id: string
  user_id: string
  title: string
  description: string | null
  body_zone: string | null
  status: SketchStatus
  tags: string[]
  url: string
  mime_type: string
  size_bytes: number
  width: number | null
  height: number | null
  created_at: string
  updated_at: string
}

export interface SketchFilters {
  status?: SketchStatus
  tag?: string
}

export interface SketchInput {
  file: File
  title: string
  description?: string
  bodyZone?: string
  status?: SketchStatus
  tags?: string[]
}

/** Límites que también valida el backend; se comprueban antes de subir. */
export const MAX_FILE_BYTES = 5 * 1024 * 1024
export const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

/** Lista la galería del usuario autenticado (T0010). */
export function listSketches(filters: SketchFilters = {}): Promise<Sketch[]> {
  const params = new URLSearchParams()
  if (filters.status) params.set('status', filters.status)
  if (filters.tag) params.set('tag', filters.tag)

  const query = params.toString()
  return apiFetch<{ sketches: Sketch[] }>(`/api/sketches${query ? `?${query}` : ''}`).then(
    (r) => r.sketches,
  )
}

/**
 * Sube un boceto. Va como multipart/form-data porque lleva el archivo:
 * apiFetch detecta el FormData y no fuerza el Content-Type.
 */
export function createSketch(input: SketchInput): Promise<Sketch> {
  const form = new FormData()
  form.append('image', input.file)
  form.append('title', input.title)
  if (input.description) form.append('description', input.description)
  if (input.bodyZone) form.append('bodyZone', input.bodyZone)
  if (input.status) form.append('status', input.status)
  if (input.tags?.length) form.append('tags', input.tags.join(','))

  return apiFetch<{ sketch: Sketch }>('/api/sketches', {
    method: 'POST',
    body: form,
  }).then((r) => r.sketch)
}

/** Edita los metadatos de un boceto (no reemplaza la imagen). */
export function updateSketch(
  id: string,
  fields: Partial<Pick<Sketch, 'title' | 'description' | 'body_zone' | 'status' | 'tags'>>,
): Promise<Sketch> {
  const body: Record<string, unknown> = {}
  if (fields.title !== undefined) body.title = fields.title
  if (fields.description !== undefined) body.description = fields.description
  if (fields.body_zone !== undefined) body.bodyZone = fields.body_zone
  if (fields.status !== undefined) body.status = fields.status
  if (fields.tags !== undefined) body.tags = fields.tags

  return apiFetch<{ sketch: Sketch }>(`/api/sketches/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  }).then((r) => r.sketch)
}

/** Borra el boceto y su archivo del almacenamiento. */
export function deleteSketch(id: string): Promise<void> {
  return apiFetch<void>(`/api/sketches/${id}`, { method: 'DELETE' })
}

/** Formatea bytes para mostrarlos en la ficha del boceto. */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}