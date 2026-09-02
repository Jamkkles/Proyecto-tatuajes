import { useCallback, useState, type ReactNode } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { getUser, logout } from '../lib/auth'
import { useHideOnScroll } from '../lib/useHideOnScroll'
import type { AppHeader } from '../lib/useAppShellHeader'
import Atmos from './Atmos'
import ThemeToggle from './ThemeToggle'
import './AppShell.css'

/**
 * Shell de la app autenticada: sidebar desplegable + barra superior con botón
 * de menú y auto-ocultado al hacer scroll. Se monta una sola vez como *layout
 * route* y las vistas se intercambian dentro (`<Outlet>`), así el sidebar y el
 * scroll no se reinician al navegar.
 *
 * Cada vista declara su título de barra con `useAppShellHeader()`.
 */

/* ---------- Iconos de navegación (line, 24px) ---------- */
const icons: Record<string, ReactNode> = {
  resumen: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" />
    </svg>
  ),
  bocetos: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.8" /><path d="M21 15l-5-5L5 21" />
    </svg>
  ),
  citas: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="4.5" width="18" height="16" rx="2" /><path d="M3 9h18M8 2.5v4M16 2.5v4" />
    </svg>
  ),
  cotizaciones: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="5" y="2.5" width="14" height="19" rx="2" /><path d="M9 7h6M9 11h6M9 15h3" />
    </svg>
  ),
  inventario: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3.5 7.5L12 3l8.5 4.5v9L12 21l-8.5-4.5z" /><path d="M3.5 7.5L12 12l8.5-4.5M12 12v9" />
    </svg>
  ),
  prev3d: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.5 2.5 15.5 0 18M12 3c-2.5 2.5-2.5 15.5 0 18" />
    </svg>
  ),
  config: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 13a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-1.8-.3 1.6 1.6 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.6 1.6 0 00-1-1.5 1.6 1.6 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1H3a2 2 0 110-4h.1a1.6 1.6 0 001.5-1 1.6 1.6 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 001.8.3H11a1.6 1.6 0 001-1.5V3a2 2 0 114 0v.1a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8V11a1.6 1.6 0 001.5 1H21a2 2 0 110 4h-.1a1.6 1.6 0 00-1.5 1z" />
    </svg>
  ),
  logout: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3M10 17l5-5-5-5M15 12H3" />
    </svg>
  ),
  bell: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 01-3.4 0" strokeLinecap="round" />
    </svg>
  ),
}

// `to` apunta a la ruta del módulo; los que aún no existen quedan sin ella.
const NAV = [
  { key: 'resumen', label: 'Resumen', to: '/dashboard' },
  { key: 'bocetos', label: 'Bocetos', to: '/bocetos' },
  { key: 'citas', label: 'Citas' },
  { key: 'cotizaciones', label: 'Cotizaciones' },
  { key: 'inventario', label: 'Inventario' },
  { key: 'prev3d', label: 'Previsualización 3D', to: '/previsualizacion' },
  { key: 'config', label: 'Configuración' },
]

export default function AppShell() {
  const navigate = useNavigate()
  const location = useLocation()
  const user = getUser()

  const [navOpen, setNavOpen] = useState(
    () => typeof window !== 'undefined' && window.innerWidth >= 900,
  )
  const [header, setHeaderState] = useState<AppHeader>({})
  // `setHeader` estable para el `useEffect` de `useAppShellHeader`.
  const setHeader = useCallback((next: AppHeader) => setHeaderState(next), [])

  // El header se esconde al bajar y vuelve al subir o con el mouse arriba.
  const headerHidden = useHideOnScroll()

  const firstName = user?.name?.trim().split(/\s+/)[0] ?? 'artista'
  const initial = firstName.charAt(0).toUpperCase()

  function handleLogout() {
    logout()
    navigate('/', { replace: true })
  }

  return (
    <div className={`dash${navOpen ? ' dash--nav-open' : ''}`}>
      <Atmos />

      {/* ---------- Backdrop (móvil) ---------- */}
      <div
        className="dash__backdrop"
        onClick={() => setNavOpen(false)}
        aria-hidden="true"
      />

      {/* ---------- Sidebar ---------- */}
      <aside className="dash__sidebar" id="dash-nav">
        <div className="dash__brand">
          <span className="dash__seal" aria-hidden="true" />
          <span className="dash__brand-text">
            <span className="dash__wordmark">Hector Tattoos</span>
            <span className="dash__brand-sub">by Héctor</span>
          </span>
        </div>

        <nav className="dash__nav" aria-label="Secciones del estudio">
          {NAV.map((item) => {
            const active = !!item.to && location.pathname === item.to
            return (
              <button
                key={item.key}
                type="button"
                className={`navitem${active ? ' navitem--active' : ''}`}
                aria-current={active ? 'page' : undefined}
                disabled={!item.to}
                onClick={() => item.to && navigate(item.to)}
              >
                <span className="navitem__icon">{icons[item.key]}</span>
                {item.label}
              </button>
            )
          })}
        </nav>

        <div className="dash__side-foot">
          <div className="dash__user">
            <span className="dash__avatar" aria-hidden="true">{initial}</span>
            <span className="dash__user-text">
              <span className="dash__user-name">{user?.name ?? 'Artista'}</span>
              <span className="dash__user-mail">{user?.email ?? ''}</span>
            </span>
          </div>
          <button className="dash__logout" type="button" onClick={handleLogout}>
            <span className="navitem__icon">{icons.logout}</span>
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* ---------- Contenido ---------- */}
      <div className="dash__main">
        <header className={`dash__top${headerHidden ? ' dash__top--hidden' : ''}`}>
          <button
            className="dash__toggle"
            type="button"
            onClick={() => setNavOpen((v) => !v)}
            aria-expanded={navOpen}
            aria-controls="dash-nav"
            aria-label={navOpen ? 'Ocultar menú' : 'Mostrar menú'}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          {header.title && (
            <div className="dash__top-titles">
              <h1 className="dash__top-title">{header.title}</h1>
              {header.subtitle && <p className="dash__top-sub">{header.subtitle}</p>}
            </div>
          )}

          <div className="dash__top-right">
            <ThemeToggle className="dash__iconbtn" />
            <button className="dash__iconbtn dash__iconbtn--dot" type="button" aria-label="Notificaciones">
              <span className="navitem__icon">{icons.bell}</span>
            </button>
            <span className="dash__avatar dash__avatar--sm" aria-hidden="true">{initial}</span>
          </div>
        </header>

        <Outlet context={{ setHeader }} />
      </div>
    </div>
  )
}
