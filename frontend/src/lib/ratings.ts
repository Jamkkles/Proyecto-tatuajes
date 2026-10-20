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
  { value: 'alto', label: 'Confiables (4 o más)' },
  { value: 'medio', label: 'Regulares (3 a 4)' },
  { value: 'bajo', label: 'Poco confiables (menos de 3)' },
  { value: 'sin', label: 'Sin calificar' },
]

/** ¿Este promedio cae en el filtro? `avg` es null si ninguna de sus sesiones está calificada. */
export function matchesRating(avg: number | null, filter: RatingFilter): boolean {
  switch (filter) {
    case 'todos':
      return true
    case 'sin':
      return avg === null
    case 'alto':
      return avg !== null && avg >= 4
    case 'medio':
      return avg !== null && avg >= 3 && avg < 4
    case 'bajo':
      return avg !== null && avg < 3
  }
}

const avgFmt = new Intl.NumberFormat('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
/** 4.3 → «4,3»; siempre con un decimal. */
export const formatAverage = (avg: number) => avgFmt.format(avg)

/** Las estrellas enteras que se pintan para un promedio: 4,3 → 4 y 4,5 → 5. */
export const starsFor = (avg: number | null) => (avg === null ? null : Math.min(5, Math.max(1, Math.round(avg))))

type Attendance = Pick<Client, 'sessions_done' | 'no_shows' | 'cancellations'>

/** «3 sesiones hechas · 2 no asistió · 1 cancelada», o null si no hay historial que contar. */
export function attendanceText(c: Attendance): string | null {
  const parts: string[] = []
  if (c.sessions_done > 0) parts.push(`${c.sessions_done} ${c.sessions_done === 1 ? 'sesión hecha' : 'sesiones hechas'}`)
  if (c.no_shows > 0) parts.push(`${c.no_shows} no asistió`)
  if (c.cancellations > 0) parts.push(`${c.cancellations} ${c.cancellations === 1 ? 'cancelada' : 'canceladas'}`)
  return parts.length ? parts.join(' · ') : null
}
