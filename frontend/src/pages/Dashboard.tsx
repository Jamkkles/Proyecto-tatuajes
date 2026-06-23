import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { getUser, logout } from '../lib/auth'
import './Dashboard.css'

/* ---------- Iconos (line, 24px) ---------- */
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
  logout: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3M10 17l5-5-5-5M15 12H3" />
    </svg>
  ),
}

const NAV = [
  { key: 'resumen', label: 'Resumen' },
  { key: 'bocetos', label: 'Bocetos' },
  { key: 'citas', label: 'Citas' },
  { key: 'cotizaciones', label: 'Cotizaciones' },
  { key: 'inventario', label: 'Inventario' },
  { key: 'prev3d', label: 'Previsualización 3D' },
]

const STATS = [
  { label: 'Citas hoy', value: '4', sub: '2 confirmadas' },
  { label: 'Bocetos', value: '28', sub: '+5 esta semana' },
  { label: 'Ingresos del mes', value: '$1,24M', sub: 'CLP' },
  { label: 'Insumos bajos', value: '3', sub: 'por reponer' },
]

const APPOINTMENTS = [
  { time: '11:00', client: 'Camila Rojas', detail: 'Irezumi · antebrazo', dur: '2 h', live: true },
  { time: '13:30', client: 'Diego Fuentes', detail: 'Línea fina · costado', dur: '1 h', live: true },
  { time: '16:00', client: 'Valentina Soto', detail: 'Retoque · hombro', dur: '45 min', live: false },
  { time: '18:00', client: 'Matías Herrera', detail: 'Black & grey · pierna', dur: '3 h', live: false },
]

const FLASH = [
  { src: '/descarga2.jpg', title: 'Oni', zone: 'Máscara' },
  { src: '/descarga1.jpg', title: 'Dragón', zone: 'Brazo completo' },
  { src: '/clouds.jpg', title: 'Nubes', zone: 'Relleno' },
  { src: '/dashboard-bg.jpg', title: 'Templo', zone: 'Espalda' },
]

export default function Dashboard() {
  const navigate = useNavigate()
  const user = getUser()
  const [navOpen, setNavOpen] = useState(
    () => typeof window !== 'undefined' && window.innerWidth >= 900,
  )

  const firstName = user?.name?.trim().split(/\s+/)[0] ?? 'artista'
  const initial = firstName.charAt(0).toUpperCase()
  const today = new Intl.DateTimeFormat('es-CL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date())

  function handleLogout() {
    logout()
    navigate('/', { replace: true })
  }

  return (
    <div className={`dash${navOpen ? ' dash--nav-open' : ''}`}>
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
            <span className="dash__brand-sub">Estudio</span>
          </span>
        </div>

        <nav className="dash__nav" aria-label="Secciones del estudio">
          {NAV.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`navitem${item.key === 'resumen' ? ' navitem--active' : ''}`}
              aria-current={item.key === 'resumen' ? 'page' : undefined}
            >
              <span className="navitem__icon">{icons[item.key]}</span>
              {item.label}
            </button>
          ))}
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
        <header className="dash__top">
          <div className="dash__top-left">
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
            <h1 className="dash__top-title">Resumen</h1>
          </div>
          <button className="dash__cta" type="button">Nueva cita</button>
        </header>

        <div className="dash__scroll">
          {/* Hero */}
          <section className="hero">
            <div className="hero__inner">
              <p className="hero__eyebrow">{today}</p>
              <h2 className="hero__title">
                Hola, <span className="hero__title-em">{firstName}</span>
              </h2>
              <p className="hero__lead">
                Cuatro citas en tu jornada y cinco bocetos nuevos esta semana. Tu estudio, al día.
              </p>
            </div>
          </section>

          {/* Stats */}
          <section className="stats" aria-label="Resumen de actividad">
            {STATS.map((s) => (
              <article className="statcard" key={s.label}>
                <p className="statcard__label">{s.label}</p>
                <p className="statcard__value">{s.value}</p>
                <p className="statcard__sub">{s.sub}</p>
              </article>
            ))}
          </section>

          {/* Paneles */}
          <div className="panels">
            <section className="panelbox" aria-labelledby="appt-h">
              <div className="panelbox__head">
                <h3 className="panelbox__title" id="appt-h">Próximas citas</h3>
                <span className="panelbox__count">Hoy · {APPOINTMENTS.length}</span>
              </div>
              <ul className="appt-list">
                {APPOINTMENTS.map((a) => (
                  <li className="appt" key={a.time}>
                    <span className="appt__time">{a.time}</span>
                    <span className={`appt__dot${a.live ? ' appt__dot--live' : ''}`} aria-hidden="true" />
                    <span className="appt__body">
                      <span className="appt__client">{a.client}</span>
                      <span className="appt__detail">{a.detail}</span>
                    </span>
                    <span className="appt__dur">{a.dur}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="panelbox" aria-labelledby="flash-h">
              <div className="panelbox__head">
                <h3 className="panelbox__title" id="flash-h">Bocetos recientes</h3>
                <button type="button" className="panelbox__link">Ver galería</button>
              </div>
              <div className="gallery">
                {FLASH.map((f) => (
                  <figure className="flash" key={f.title}>
                    <img className="flash__img" src={f.src} alt={`${f.title} — ${f.zone}`} loading="lazy" />
                    <figcaption className="flash__cap">
                      <span className="flash__title">{f.title}</span>
                      <span className="flash__zone">{f.zone}</span>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
