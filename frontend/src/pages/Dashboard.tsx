import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { getUser } from '../lib/auth'
import { listSketches, type Sketch } from '../lib/sketches'
import MonthCalendar from '../components/MonthCalendar'
import { viewerIcons } from '../components/icons'
import { isoLocal } from '../lib/dates'
import { useAppShellHeader } from '../lib/useAppShellHeader'
import './Dashboard.css'

/* ---------- Iconos (line, 24px) ---------- */
const icons: Record<string, ReactNode> = {
  chevronLeft: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  chevronRight: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  /* ---- iconos de tarjetas de estadística ---- */
  statCitas: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="3" y="4.5" width="18" height="16" rx="2" /><path d="M3 9h18M8 2.5v4M16 2.5v4" />
    </svg>
  ),
  statClientes: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0114 0" strokeLinecap="round" />
    </svg>
  ),
  statIngresos: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M4 8c0-1.5 3.6-2.5 8-2.5S20 6.5 20 8v8c0 1.5-3.6 2.5-8 2.5S4 17.5 4 16z" />
      <path d="M4 8v0M12 11.5a2 2 0 100 4 2 2 0 000-4z" />
    </svg>
  ),
  statBocetos: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M15.5 4.5l4 4L8 20l-4 1 1-4z" strokeLinejoin="round" /><path d="M13.5 6.5l4 4" />
    </svg>
  ),
}

// Tarjetas de estadística: todas con el mismo aspecto neutro (sin tintes).
// "Bocetos" se rellena con el total real.
const STATS = [
  { key: 'citas', label: 'Citas este mes', value: '4', sub: '2 confirmadas', icon: 'statCitas' },
  { key: 'clientes', label: 'Nuevos clientes', value: '0', sub: 'este mes', icon: 'statClientes' },
  { key: 'ingresos', label: 'Ingresos mensuales', value: '$1,24M', sub: 'CLP', icon: 'statIngresos' },
  { key: 'bocetos', label: 'Bocetos creados', value: '3', sub: 'en total', icon: 'statBocetos' },
] as const

const APPOINTMENTS = [
  { time: '11:00', client: 'Camila Rojas', detail: 'Irezumi · antebrazo', dur: '2 h', live: true },
  { time: '13:30', client: 'Diego Fuentes', detail: 'Línea fina · costado', dur: '1 h', live: true },
  { time: '16:00', client: 'Valentina Soto', detail: 'Retoque · hombro', dur: '45 min', live: false },
  { time: '18:00', client: 'Matías Herrera', detail: 'Black & grey · pierna', dur: '3 h', live: false },
]

// Datos de ejemplo para el calendario mientras no existe el módulo de Citas.
// Relativos al mes en curso: el marcador de "hoy" cuadra con APPOINTMENTS y
// nunca queda obsoleto. Al implementar citas, esto saldrá de la lista real.
function mockApptsByDay(ref = new Date()): Record<string, number> {
  const key = (day: number) => isoLocal(new Date(ref.getFullYear(), ref.getMonth(), day))
  return {
    [key(ref.getDate())]: APPOINTMENTS.length,
    [key(3)]: 2,
    [key(12)]: 1,
    [key(18)]: 3,
    [key(26)]: 1,
  }
}

// Imágenes de reserva para el carrusel cuando aún no hay bocetos importados.
const CAROUSEL_FALLBACK = ['/descarga1.webp', '/descarga2.webp', '/dashboard-bg.webp']

// Cada cuánto avanza solo el carrusel (ms).
const CAROUSEL_AUTO_MS = 10200
// Duración de cada desplazamiento animado (ms): mayor = más lento y suave.
const CAROUSEL_NUDGE_MS = 1000

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)

// Paso de una tarjeta (ancho + separación) medido en el DOM del carril.
function slideStride(el: HTMLElement) {
  const slides = el.querySelectorAll<HTMLElement>('.slide')
  if (slides.length >= 2) return slides[1].offsetLeft - slides[0].offsetLeft
  return el.clientWidth / 3
}

export default function Dashboard() {
  const navigate = useNavigate()
  const user = getUser()

  // El "Resumen" no pone título en la barra superior compartida.
  useAppShellHeader({})

  const [flash, setFlash] = useState<Sketch[]>([])
  const [sketchCount, setSketchCount] = useState<number | null>(null)

  // Carrusel "Últimos bocetos": auto-avance por pasos. Las tarjetas se
  // renderizan dos veces; cada movimiento anima `scrollLeft` y lo mantiene
  // dentro de una copia con módulo. Como ambas copias son idénticas, el salto
  // al cerrar el ciclo es invisible: siempre hay recorrido y se ve infinito,
  // aun con pocos bocetos. Auto avanza una tarjeta; las flechas, una página.
  const carouselRef = useRef<HTMLDivElement>(null)
  const pausedRef = useRef(false)
  // Desplazamiento en curso: { start (t0), from, to } en píxeles absolutos.
  const nudgeRef = useRef<{ start: number; from: number; to: number } | null>(null)

  function scrollCarousel(dir: -1 | 1) {
    const el = carouselRef.current
    if (!el) return
    const from = el.scrollLeft
    // Una página ≈ tres tarjetas (lo que se ve a la vez en escritorio).
    nudgeRef.current = { start: performance.now(), from, to: from + dir * slideStride(el) * 3 }
  }

  useEffect(() => {
    const el = carouselRef.current
    if (!el) return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

    const pause = () => { pausedRef.current = true }
    const resume = () => { pausedRef.current = false }
    el.addEventListener('mouseenter', pause)
    el.addEventListener('mouseleave', resume)
    el.addEventListener('focusin', pause)
    el.addEventListener('focusout', resume)

    // Anima el desplazamiento en curso y envuelve la posición dentro de una
    // copia (período = paso × nº de tarjetas de una copia) con módulo.
    let raf = 0
    const loop = (now: number) => {
      const nudge = nudgeRef.current
      if (nudge) {
        const slides = el.querySelectorAll<HTMLElement>('.slide')
        const stride = slides.length >= 2 ? slides[1].offsetLeft - slides[0].offsetLeft : el.clientWidth / 3
        const period = stride * (slides.length / 2)
        const p = Math.min(1, (now - nudge.start) / CAROUSEL_NUDGE_MS)
        let x = nudge.from + (nudge.to - nudge.from) * easeInOut(p)
        if (period > 0) x = ((x % period) + period) % period // bucle sin corte
        el.scrollLeft = x
        if (p >= 1) nudgeRef.current = null
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    // Auto-avance: una tarjeta cada CAROUSEL_AUTO_MS, salvo pausa (hover/foco),
    // movimiento en curso o `prefers-reduced-motion`.
    const id = window.setInterval(() => {
      if (reduce || pausedRef.current || nudgeRef.current) return
      const from = el.scrollLeft
      nudgeRef.current = { start: performance.now(), from, to: from + slideStride(el) }
    }, CAROUSEL_AUTO_MS)

    return () => {
      cancelAnimationFrame(raf)
      window.clearInterval(id)
      el.removeEventListener('mouseenter', pause)
      el.removeEventListener('mouseleave', resume)
      el.removeEventListener('focusin', pause)
      el.removeEventListener('focusout', resume)
    }
  }, [flash.length])

  // Bocetos reales de la galería (T0010): los más recientes para el carrusel y
  // el total para la tarjeta de estadísticas.
  useEffect(() => {
    listSketches()
      .then((list) => {
        setFlash(list.slice(0, 8))
        setSketchCount(list.length)
      })
      .catch(() => {
        setFlash([])
        setSketchCount(null)
      })
  }, [])

  // El carrusel muestra bocetos reales; si no hay, cae a imágenes de reserva.
  const carousel = flash.length
    ? flash.map((f) => ({ id: String(f.id), url: f.url, title: f.title, zone: f.body_zone ?? f.status }))
    : CAROUSEL_FALLBACK.map((url, i) => ({ id: `ph-${i}`, url, title: 'Boceto de ejemplo', zone: 'Importa el primero' }))

  const firstName = user?.name?.trim().split(/\s+/)[0] ?? 'artista'
  const today = new Intl.DateTimeFormat('es-CL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date())

  return (
    <div className="dash__scroll">
      {/* ---- Saludo + fecha ---- */}
      <section className="greet">
        <h1 className="greet__title">
          Hola, <span className="greet__title-em">{firstName}</span>
        </h1>
        <p className="greet__date">{today}</p>
      </section>

      {/* ---- Carrusel: últimos bocetos ---- */}
      <section className="carousel" aria-labelledby="carousel-h">
        <div className="carousel__head">
          <h2 className="carousel__title" id="carousel-h">Últimos bocetos</h2>
          <div className="carousel__nav">
            <button
              type="button"
              className="carousel__arrow"
              onClick={() => scrollCarousel(-1)}
              aria-label="Ver bocetos anteriores"
            >
              <span className="navitem__icon">{icons.chevronLeft}</span>
            </button>
            <button
              type="button"
              className="carousel__arrow"
              onClick={() => scrollCarousel(1)}
              aria-label="Ver más bocetos"
            >
              <span className="navitem__icon">{icons.chevronRight}</span>
            </button>
          </div>
        </div>
        <div className="carousel__track" ref={carouselRef}>
          {/* Dos copias seguidas: la segunda alimenta el bucle sin corte. */}
          {[...carousel, ...carousel].map((c, i) => {
            const isClone = i >= carousel.length
            // Los bocetos reales llevan su id; las imágenes de reserva usan
            // `ph-N` y solo abren la galería sin destacar ninguno.
            const real = !c.id.startsWith('ph-')
            const openInGallery = () =>
              navigate(real ? `/bocetos?ver=${encodeURIComponent(c.id)}` : '/bocetos')
            return (
            <figure
              className="slide slide--link"
              key={`${c.id}-${i}`}
              aria-hidden={isClone ? true : undefined}
              role="button"
              tabIndex={isClone ? -1 : 0}
              onClick={openInGallery}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  openInGallery()
                }
              }}
            >
              <img className="slide__img" src={c.url} alt={c.title} loading="lazy" width={320} height={180} />
              <figcaption className="slide__cap">
                <span className="slide__title">{c.title}</span>
                <span className="slide__zone">{c.zone}</span>
              </figcaption>
            </figure>
            )
          })}
        </div>
      </section>

      {/* ---- Estadísticas (tarjetas pastel) ---- */}
      <section className="stats" aria-label="Resumen de actividad">
        {STATS.map((s) => {
          // "Bocetos creados" ya sale de la base de datos; el resto sigue
          // siendo maqueta hasta que se implementen sus módulos.
          const real = s.key === 'bocetos' && sketchCount !== null
          return (
            <article className="statcard" key={s.key}>
              <span className="statcard__icon" aria-hidden="true">{icons[s.icon]}</span>
              <p className="statcard__value">{real ? sketchCount : s.value}</p>
              <p className="statcard__label">{s.label}</p>
              <p className="statcard__sub">{real ? 'en tu galería' : s.sub}</p>
            </article>
          )
        })}
      </section>

      {/* ---- Vista dividida: (citas de hoy + calendario) y visor 3D debajo ---- */}
      <div className="split">
        <div className="split__row">
          <section className="panelbox split__side" aria-labelledby="appt-h">
            <div className="panelbox__head">
              <h3 className="panelbox__title" id="appt-h">Citas hoy</h3>
              <span className="panelbox__count">{APPOINTMENTS.length}</span>
            </div>
            <ul className="appt-list">
              {APPOINTMENTS.map((a) => (
                <li className="appt" key={a.time}>
                  <span className="appt__time">{a.time}</span>
                  <span className="appt__body">
                    <span className="appt__client">{a.client}</span>
                    <span className="appt__detail">{a.detail}</span>
                  </span>
                  <span className={`appt__badge${a.live ? ' appt__badge--live' : ''}`}>
                    {a.live ? 'Activa' : a.dur}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <MonthCalendar appointmentsByDay={mockApptsByDay()} />
        </div>

        <section className="panelbox split__main" aria-labelledby="viewer-h">
          <div className="panelbox__head">
            <h3 className="panelbox__title" id="viewer-h">
              Visualización 3D del cuerpo humano tatuado
            </h3>
            <button
              type="button"
              className="panelbox__link"
              onClick={() => navigate('/previsualizacion')}
            >
              Abrir editor
            </button>
          </div>
          <div className="viewer">
            <div className="viewer__toolbar" role="toolbar" aria-label="Navegación 3D">
              <button type="button" className="viewer__tool" aria-label="Acercar">
                <span className="navitem__icon">{viewerIcons.zoomIn}</span>
              </button>
              <button type="button" className="viewer__tool" aria-label="Alejar">
                <span className="navitem__icon">{viewerIcons.zoomOut}</span>
              </button>
              <button type="button" className="viewer__tool" aria-label="Rotar 360°">
                <span className="navitem__icon">{viewerIcons.rotate}</span>
              </button>
              <span className="viewer__tool-sep" aria-hidden="true" />
              <button type="button" className="viewer__tool" aria-label="Desplazar arriba">
                <span className="navitem__icon">{viewerIcons.panUp}</span>
              </button>
              <button type="button" className="viewer__tool" aria-label="Desplazar abajo">
                <span className="navitem__icon">{viewerIcons.panDown}</span>
              </button>
            </div>
            <img className="viewer__model" src="/espalda.webp" alt="Torso masculino tatuado" width={800} height={1132} />
            <span className="viewer__hint">Arrastra para rotar · rueda para acercar</span>
          </div>
        </section>
      </div>
    </div>
  )
}
