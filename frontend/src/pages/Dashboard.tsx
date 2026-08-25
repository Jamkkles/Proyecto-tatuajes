import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { getUser, logout } from '../lib/auth'
import { listSketches, type Sketch } from '../lib/sketches'
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
  sun: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.5v2.6M12 18.9v2.6M4.6 4.6l1.9 1.9M17.5 17.5l1.9 1.9M2.5 12h2.6M18.9 12h2.6M4.6 19.4l1.9-1.9M17.5 6.5l1.9-1.9" strokeLinecap="round" />
    </svg>
  ),
  moon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M20 14.5A8 8 0 019.5 4a7 7 0 100 14 8 8 0 0010.5-3.5z" strokeLinejoin="round" />
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
// Ritmo de la animación de nubes (ajusta estos valores aquí):
const CLOUD_LOOP_SECONDS = 9.8 // tramo que se repite (el clip dura ~10 s)
const CLOUD_SPEED = 0.6 // velocidad de reproducción (1 = normal, <1 = más lento)
const CLOUD_FADE_SECONDS = 1.2 // duración del fundido junto al empalme

export default function Dashboard() {
  const navigate = useNavigate()
  const user = getUser()
  // Loop sin corte: dos copias del vídeo (A arriba, B abajo) desfasadas medio
  // ciclo. Cada una repite su tramo [0, L]; en el instante de su corte esa capa
  // está a opacidad 0 y la otra la cubre, así el salto nunca se ve.
  const cloudTopRef = useRef<HTMLVideoElement>(null)
  const cloudBackRef = useRef<HTMLVideoElement>(null)

  // Modo claro (washi) / oscuro (irezumi). Persiste la preferencia; cada tema
  // usa su propio vídeo de nubes.
  const [light, setLight] = useState(
    () => typeof window !== 'undefined' && localStorage.getItem('dash-theme') === 'light',
  )
  const cloudSrc = light ? '/japanese-clouds-loop.mp4' : '/clouds-loop.mp4'

  function toggleTheme() {
    setLight((v) => {
      const next = !v
      try {
        localStorage.setItem('dash-theme', next ? 'light' : 'dark')
      } catch {
        /* localStorage no disponible: el tema vive solo en memoria */
      }
      return next
    })
  }

  useEffect(() => {
    const top = cloudTopRef.current
    const back = cloudBackRef.current
    if (!top || !back) return

    const L = CLOUD_LOOP_SECONDS
    top.playbackRate = CLOUD_SPEED
    back.playbackRate = CLOUD_SPEED
    // La capa de atrás arranca medio ciclo por delante para tapar el corte.
    const offsetBack = () => { back.currentTime = L / 2 }
    if (back.readyState >= 1) offsetBack()
    else back.addEventListener('loadedmetadata', offsetBack, { once: true })

    let raf = 0
    const w = CLOUD_FADE_SECONDS / L // fracción del ciclo que dura el fundido
    const tick = () => {
      if (top.currentTime >= L) top.currentTime = 0
      if (back.currentTime >= L) back.currentTime = 0
      // La capa de atrás va siempre opaca; la de arriba solo se funde en una
      // ventana corta junto a su empalme (p≈0 y p≈1). El resto del ciclo va a 1,
      // así se ve una sola capa limpia, sin mezcla continua.
      const p = (top.currentTime % L) / L
      let o = 1
      if (p < w) o = p / w
      else if (p > 1 - w) o = (1 - p) / w
      top.style.opacity = String(o)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [cloudSrc])

  const [navOpen, setNavOpen] = useState(
    () => typeof window !== 'undefined' && window.innerWidth >= 900,
  )
  const [flash, setFlash] = useState<Sketch[]>([])
  const [sketchCount, setSketchCount] = useState<number | null>(null)

  // Bocetos reales de la galería (T0010): los cuatro más recientes para el
  // panel y el total para la tarjeta de estadísticas.
  useEffect(() => {
    listSketches()
      .then((list) => {
        setFlash(list.slice(0, 4))
        setSketchCount(list.length)
      })
      .catch(() => {
        setFlash([])
        setSketchCount(null)
      })
  }, [])

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
    <div className={`dash${navOpen ? ' dash--nav-open' : ''}${light ? ' dash--light' : ''}`}>
      {/* ---------- Atmósfera: humo en bucle sin corte (semiarco) ---------- */}
      <div className="dash__atmos" aria-hidden="true">
        <video
          key={`back-${cloudSrc}`}
          ref={cloudBackRef}
          className="dash__atmos-video"
          src={cloudSrc}
          autoPlay
          muted
          loop
          playsInline
        />
        <video
          key={`top-${cloudSrc}`}
          ref={cloudTopRef}
          className="dash__atmos-video"
          src={cloudSrc}
          autoPlay
          muted
          loop
          playsInline
        />
      </div>

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
              disabled={!item.to}
              onClick={() => item.to && navigate(item.to)}
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
          <div className="dash__top-right">
            <button
              className="dash__theme"
              type="button"
              onClick={toggleTheme}
              aria-pressed={light}
              aria-label={light ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro'}
              title={light ? 'Modo oscuro' : 'Modo claro'}
            >
              <span className="navitem__icon">{light ? icons.moon : icons.sun}</span>
            </button>
            <button className="dash__cta" type="button">Nueva cita</button>
          </div>
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
            {STATS.map((s) => {
              // "Bocetos" ya sale de la base de datos; el resto sigue siendo
              // maqueta hasta que se implementen sus módulos.
              const real = s.label === 'Bocetos' && sketchCount !== null
              return (
                <article className="statcard" key={s.label}>
                  <p className="statcard__label">{s.label}</p>
                  <p className="statcard__value">{real ? sketchCount : s.value}</p>
                  <p className="statcard__sub">{real ? 'en tu galería' : s.sub}</p>
                </article>
              )
            })}
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
                <button
                  type="button"
                  className="panelbox__link"
                  onClick={() => navigate('/bocetos')}
                >
                  Ver galería
                </button>
              </div>
              {flash.length === 0 ? (
                <p className="panelbox__empty">
                  Aún no hay bocetos.{' '}
                  <button type="button" className="panelbox__link" onClick={() => navigate('/bocetos')}>
                    Importa el primero
                  </button>
                </p>
              ) : (
                <div className="gallery">
                  {flash.map((f) => (
                    <figure className="flash" key={f.id}>
                      <img
                        className="flash__img"
                        src={f.url}
                        alt={`${f.title}${f.body_zone ? ` — ${f.body_zone}` : ''}`}
                        loading="lazy"
                      />
                      <figcaption className="flash__cap">
                        <span className="flash__title">{f.title}</span>
                        <span className="flash__zone">{f.body_zone ?? f.status}</span>
                      </figcaption>
                    </figure>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
