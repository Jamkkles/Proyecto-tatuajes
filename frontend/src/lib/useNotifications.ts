import { useCallback, useEffect, useState } from 'react'
import {
  listNotifications,
  markNotificationsRead,
  type AppNotification,
} from './notifications'

/** Cada cuánto se pregunta por avisos nuevos con la app abierta. */
const POLL_MS = 60_000

/**
 * La campanita: los últimos avisos y cuántos faltan por leer.
 *
 * Se refresca sola cada minuto y al volver a la pestaña o a la app (en un celular
 * es lo normal: se abre desde otra aplicación). Los avisos que llegan con la app
 * cerrada los entrega el push; esto es lo que pone al día la lista al abrirla.
 */
export function useNotifications() {
  const [items, setItems] = useState<AppNotification[]>([])
  const [unread, setUnread] = useState(0)
  const [loaded, setLoaded] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const feed = await listNotifications()
      setItems(feed.notifications)
      setUnread(feed.unread)
    } catch {
      // Sin red o con el servidor dormido: se queda con lo último que tenía.
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    // La primera carga y el refresco al volver a la app.
    const timer = window.setTimeout(refresh, 0)
    const interval = window.setInterval(refresh, POLL_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', refresh)
    return () => {
      window.clearTimeout(timer)
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', refresh)
    }
  }, [refresh])

  const markRead = useCallback(async (ids: string[]) => {
    const pending = ids.filter((id) => items.some((n) => n.id === id && !n.read_at))
    if (pending.length === 0) return
    // Optimista: la campanita responde al toque y no tras la red.
    const now = new Date().toISOString()
    setItems((list) => list.map((n) => (pending.includes(n.id) ? { ...n, read_at: now } : n)))
    setUnread((n) => Math.max(0, n - pending.length))
    try {
      await markNotificationsRead({ ids: pending })
    } catch {
      refresh()
    }
  }, [items, refresh])

  const markAllRead = useCallback(async () => {
    const now = new Date().toISOString()
    setItems((list) => list.map((n) => (n.read_at ? n : { ...n, read_at: now })))
    setUnread(0)
    try {
      await markNotificationsRead({ all: true })
    } catch {
      refresh()
    }
  }, [refresh])

  return { items, unread, loaded, refresh, markRead, markAllRead }
}
