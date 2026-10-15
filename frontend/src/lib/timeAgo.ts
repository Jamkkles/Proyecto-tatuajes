/** «ahora», «hace 5 min», «hace 3 h», «ayer», «hace 4 d» o la fecha. */
export function timeAgo(iso: string, now = Date.now()) {
  const minutes = Math.floor((now - new Date(iso).getTime()) / 60_000)
  if (minutes < 1) return 'ahora'
  if (minutes < 60) return `hace ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `hace ${hours} h`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'ayer'
  if (days < 7) return `hace ${days} d`
  return new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
}
