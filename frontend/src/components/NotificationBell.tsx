import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { timeAgo } from '../lib/timeAgo'
import { useNotifications } from '../lib/useNotifications'
import type { AppNotification } from '../lib/notifications'
import PushControl from './PushControl'
import './NotificationBell.css'

const bellIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.7 21a2 2 0 01-3.4 0" strokeLinecap="round" />
  </svg>
)

const kindIcons = {
  stock: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8" strokeLinejoin="round" />
    </svg>
  ),
  chat: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M21 12a8 8 0 01-11.6 7.1L4 20.5l1.5-4.9A8 8 0 1121 12z" strokeLinejoin="round" />
    </svg>
  ),
  info: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" strokeLinecap="round" />
    </svg>
  ),
}

function iconFor(kind: string) {
  if (kind === 'stock_bajo') return kindIcons.stock
  if (kind.startsWith('mensaje')) return kindIcons.chat
  return kindIcons.info
}

/**
 * La campanita de la barra superior: avisos del artista (insumos por reponer,
 * mensajes por enviar a clientes…), con contador de no leídos.
 */
export default function NotificationBell() {
  const navigate = useNavigate()
  const { items, unread, loaded, refresh, markRead, markAllRead } = useNotifications()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // Se cierra con Escape o tocando fuera.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onPointer = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [open])

  function toggle() {
    if (!open) refresh()
    setOpen((v) => !v)
  }

  function openItem(n: AppNotification) {
    markRead([n.id])
    setOpen(false)
    if (n.url) navigate(n.url)
  }

  const badge = unread > 9 ? '9+' : String(unread)

  return (
    <div className="bell" ref={rootRef}>
      <button
        type="button"
        className="dash__iconbtn bell__btn"
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={unread > 0 ? `Notificaciones, ${unread} sin leer` : 'Notificaciones'}
      >
        <span className="navitem__icon">{bellIcon}</span>
        {unread > 0 && (
          <span className="bell__badge" aria-hidden="true">
            {badge}
          </span>
        )}
      </button>

      {open && (
        <div className="bell__panel" role="dialog" aria-label="Notificaciones">
          <header className="bell__head">
            <h2 className="bell__title">Notificaciones</h2>
            {unread > 0 && (
              <button type="button" className="nb-link" onClick={markAllRead}>
                Marcar todas como leídas
              </button>
            )}
          </header>

          {!loaded ? (
            <p className="bell__empty">Cargando…</p>
          ) : items.length === 0 ? (
            <p className="bell__empty">
              Aún no hay avisos. Aquí verás los recordatorios por enviar y los insumos por reponer.
            </p>
          ) : (
            <ul className="bell__list">
              {items.map((n) => (
                <li key={n.id} className={`bell__item${n.read_at ? '' : ' is-unread'}`}>
                  <button type="button" className="bell__main" onClick={() => openItem(n)}>
                    <span className="bell__icon">{iconFor(n.kind)}</span>
                    <span className="bell__text">
                      <strong>{n.title}</strong>
                      {n.body && <span>{n.body}</span>}
                      <time dateTime={n.created_at}>{timeAgo(n.created_at)}</time>
                    </span>
                  </button>
                  {n.data.waLink && (
                    <a
                      className="nb-btn bell__action"
                      href={n.data.waLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => markRead([n.id])}
                    >
                      Enviar por WhatsApp
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}

          <footer className="bell__foot">
            <PushControl />
            <Link to="/configuracion" className="nb-link" onClick={() => setOpen(false)}>
              Ajustes de avisos y mensajes
            </Link>
          </footer>
        </div>
      )}
    </div>
  )
}
