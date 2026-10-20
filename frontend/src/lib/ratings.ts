import type { Client } from './agenda'

/**
 * Puntaje de responsabilidad de llegada de un cliente (HU30): de 1 a 5 estrellas que le
 * pone el artista. Sin puntaje, el cliente aún no está calificado.
 */
export const RATING_TEXT: Record<number, string> = {
  1: 'Muy poco confiable',
  2: 'Poco confiable',
  3: 'Regular',
  4: 'Confiable',
  5: 'Muy confiable',
}

export type RatingFilter = 'todos' | 'alto' | 'medio' | 'bajo' | 'sin'

export const RATING_FILTERS: { value: RatingFilter; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'alto', label: 'Confiables (4–5)' },
  { value: 'medio', label: 'Regulares (3)' },
  { value: 'bajo', label: 'Poco confiables (1–2)' },
  { value: 'sin', label: 'Sin puntaje' },
]

export function matchesRating(rating: number | null, filter: RatingFilter): boolean {
  switch (filter) {
    case 'todos':
      return true
    case 'sin':
      return rating === null
    case 'alto':
      return rating !== null && rating >= 4
    case 'medio':
      return rating === 3
    case 'bajo':
      return rating !== null && rating <= 2
  }
}

type Attendance = Pick<Client, 'sessions_done' | 'no_shows' | 'cancellations'>

/** «3 sesiones hechas · 2 no asistió · 1 cancelada», o null si no hay historial que contar. */
export function attendanceText(c: Attendance): string | null {
  const parts: string[] = []
  if (c.sessions_done > 0) parts.push(`${c.sessions_done} ${c.sessions_done === 1 ? 'sesión hecha' : 'sesiones hechas'}`)
  if (c.no_shows > 0) parts.push(`${c.no_shows} no asistió`)
  if (c.cancellations > 0) parts.push(`${c.cancellations} ${c.cancellations === 1 ? 'cancelada' : 'canceladas'}`)
  return parts.length ? parts.join(' · ') : null
}
