/**
 * Utilidades de fecha puras, en hora local. Sin dependencias.
 *
 * Regla de oro: nunca `new Date('YYYY-MM-DD')` (se interpreta como UTC y en
 * Chile cae un día antes). Construir con `new Date(y, m, d)` y parsear con
 * `` new Date(`${iso}T00:00:00`) ``.
 */

/** Índice de día con la semana empezando en lunes: lunes=0 … domingo=6. */
export const mondayIndex = (d: Date) => (d.getDay() + 6) % 7

export const daysInMonth = (year: number, month: number) =>
  new Date(year, month + 1, 0).getDate()

export const startOfMonth = (year: number, month: number) => new Date(year, month, 1)

/** 'YYYY-MM-DD' en hora local. */
export const isoLocal = (d: Date) => {
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

export const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate()

/** ¿Es una fecha 'YYYY-MM-DD' válida? (p. ej. un `?dia=` de la URL) */
export const isIsoDay = (value: string | null): value is string =>
  !!value &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  isoLocal(new Date(`${value}T00:00:00`)) === value

/** 'HH:MM' en hora local. */
export const timeLocal = (d: Date) =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

/**
 * Fecha 'YYYY-MM-DD' + hora 'HH:MM' de un formulario (hora local del
 * navegador) → instante ISO en UTC, que es lo que guarda el backend.
 */
export const localInputsToIso = (date: string, time: string) =>
  new Date(`${date}T${time}:00`).toISOString()

/** 42 celdas (6×7), lunes primero, con los días de los meses vecinos. */
export function buildMonthGrid(year: number, month: number): Date[] {
  const lead = mondayIndex(startOfMonth(year, month))
  const first = new Date(year, month, 1 - lead)
  return Array.from(
    { length: 42 },
    (_, i) => new Date(first.getFullYear(), first.getMonth(), first.getDate() + i),
  )
}
