import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { getUser } from '../lib/auth'
import { listSketches } from '../lib/sketches'
import { listMaterials, type Material } from '../lib/materials'
import {
  countSessionsByDay,
  formatTime,
  groupSessionsByDay,
  listClients,
  getIncome,
  listSessions,
  sessionStatusLabel,
  type CalendarSession,
  type Income,
} from '../lib/agenda'
import MonthCalendar from '../components/MonthCalendar'
import { formatCLP } from '../lib/money'
import { buildMonthGrid, isSameDay, startOfMonth } from '../lib/dates'
import { useAppShellHeader } from '../lib/useAppShellHeader'
import './Dashboard.css'

/* ---------- Iconos (line, 24px) ---------- */
const icons: Record<string, ReactNode> = {
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
// Todas se rellenan con datos reales del artista; mientras cargan muestran «—».
const STATS = [
  { key: 'citas', label: 'Citas este mes', value: '—', sub: 'cargando…', icon: 'statCitas' },
  { key: 'clientes', label: 'Nuevos clientes', value: '—', sub: 'cargando…', icon: 'statClientes' },
  { key: 'ingresos', label: 'Cobrado este mes', value: '—', sub: 'cargando…', icon: 'statIngresos' },
  { key: 'bocetos', label: 'Bocetos creados', value: '—', sub: 'cargando…', icon: 'statBocetos' },
] as const

// "Próximas citas": las siguientes sesiones agendadas dentro de este plazo.
const UPCOMING_DAYS = 60
const UPCOMING_MAX = 5
// "Stock bajo": cuántos insumos en nivel crítico se listan (el resto, en Inventario).
const LOW_STOCK_MAX = 5

const shortDayFmt = new Intl.DateTimeFormat('es-CL', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})

const longDayFmt = new Intl.DateTimeFormat('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })

// Citas que se listan en la vista previa de un día del calendario.
const PREVIEW_MAX = 4

/** "Hoy", "Mañana" o "mar, 22 sept". */
function dayLabel(iso: string, today: Date) {
  const date = new Date(iso)
  if (isSameDay(date, today)) return 'Hoy'
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
  if (isSameDay(date, tomorrow)) return 'Mañana'
  return shortDayFmt.format(date)
}

export default function Dashboard() {
  const navigate = useNavigate()
  const user = getUser()

  // El "Resumen" no pone título en la barra superior compartida.
  useAppShellHeader({})

  const [sketchCount, setSketchCount] = useState<number | null>(null)

  // Tarjetas "Citas este mes" y "Nuevos clientes": conteos reales del mes en
  // curso (no del mes que esté mirando el calendario).
  const [monthStats, setMonthStats] = useState<{ total: number; confirmadas: number } | null>(null)
  // Lo cobrado en el mes (por fecha de pago) y lo que falta cobrar de sus citas.
  const [income, setIncome] = useState<Income | null>(null)
  const [newClients, setNewClients] = useState<number | null>(null)

  // Agenda real: próximas sesiones agendadas (null = cargando) y las citas del
  // mes que muestra el calendario.
  const [upcoming, setUpcoming] = useState<CalendarSession[] | null>(null)
  const [upcomingError, setUpcomingError] = useState(false)
  const [monthSessions, setMonthSessions] = useState<CalendarSession[]>([])
  /** Descarta la respuesta de un mes si ya se navegó a otro. */
  const monthReqRef = useRef(0)

  // Insumos en nivel crítico (HU13/HU25): null = cargando.
  const [lowStock, setLowStock] = useState<Material[] | null>(null)
  const [lowStockError, setLowStockError] = useState(false)

  useEffect(() => {
    listMaterials({ low: true })
      .then(setLowStock)
      .catch(() => setLowStockError(true))
  }, [])

  // Total de bocetos para la tarjeta de estadísticas.
  useEffect(() => {
    listSketches()
      .then((list) => setSketchCount(list.length))
      .catch(() => setSketchCount(null))
  }, [])

  useEffect(() => {
    const now = new Date()
    const until = new Date(now.getFullYear(), now.getMonth(), now.getDate() + UPCOMING_DAYS)
    listSessions(now, until)
      .then((list) => setUpcoming(list.filter((s) => s.status === 'agendada').slice(0, UPCOMING_MAX)))
      .catch(() => setUpcomingError(true))
  }, [])

  useEffect(() => {
    const now = new Date()
    const from = startOfMonth(now.getFullYear(), now.getMonth())
    const to = startOfMonth(now.getFullYear(), now.getMonth() + 1)
    listSessions(from, to)
      .then((list) =>
        setMonthStats({
          total: list.length,
          confirmadas: list.filter((s) => s.status === 'agendada').length,
        }),
      )
      .catch(() => setMonthStats(null))

    getIncome(from, to)
      .then(setIncome)
      .catch(() => setIncome(null))

    listClients()
      .then((clients) =>
        setNewClients(
          clients.filter((c) => {
            const created = new Date(c.created_at)
            return created.getFullYear() === now.getFullYear() && created.getMonth() === now.getMonth()
          }).length,
        ),
      )
      .catch(() => setNewClients(null))
  }, [])

  // El calendario avisa el mes visible (al montar y al cambiar de mes); se
  // piden también los días de los meses vecinos que asoman en la grilla.
  const loadMonth = useCallback((year: number, month: number) => {
    const grid = buildMonthGrid(year, month)
    const last = grid[grid.length - 1]
    const req = ++monthReqRef.current
    listSessions(grid[0], new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1))
      .then((list) => {
        if (req === monthReqRef.current) setMonthSessions(list)
      })
      .catch(() => {
        if (req === monthReqRef.current) setMonthSessions([])
      })
  }, [])

  const apptsByDay = useMemo(() => countSessionsByDay(monthSessions), [monthSessions])
  const sessionsByDay = useMemo(() => groupSessionsByDay(monthSessions), [monthSessions])

  /** Vista previa al pasar el mouse por un día con citas. */
  function renderDayPreview(iso: string) {
    const list = sessionsByDay[iso]
    if (!list?.length) return null
    return (
      <>
        <p className="mcal-tip__date">{longDayFmt.format(new Date(`${iso}T00:00:00`))}</p>
        <ul className="mcal-tip__list">
          {list.slice(0, PREVIEW_MAX).map((s) => (
            <li key={s.id}>
              <span className="mcal-tip__time">{formatTime(s.starts_at)}</span>
              <span className="mcal-tip__body">
                <span className="mcal-tip__client">{s.client_name}</span>
                <span className="mcal-tip__detail">
                  {s.project_title}
                  {s.status !== 'agendada' ? ` · ${sessionStatusLabel(s.status)}` : ''}
                </span>
              </span>
            </li>
          ))}
        </ul>
        {list.length > PREVIEW_MAX && (
          <p className="mcal-tip__more">y {list.length - PREVIEW_MAX} más</p>
        )}
        <p className="mcal-tip__hint">Clic para ver el día en Citas</p>
      </>
    )
  }

  const firstName = user?.name?.trim().split(/\s+/)[0] ?? 'artista'
  const now = new Date()
  const today = new Intl.DateTimeFormat('es-CL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(now)

  return (
    <div className="dash__scroll">
      {/* ---- Saludo + fecha ---- */}
      <section className="greet">
        <h1 className="greet__title">
          Hola, <span className="greet__title-em">{firstName}</span>
        </h1>
        <p className="greet__date">{today}</p>
      </section>

      {/* ---- Agenda: lo principal. Calendario del mes + próximas citas ---- */}
      <div className="split__row">
        <MonthCalendar
          appointmentsByDay={apptsByDay}
          onMonthChange={loadMonth}
          renderDayPreview={renderDayPreview}
          onSelectDay={(iso) => navigate(`/citas?dia=${iso}`)}
        />

        <div className="split__aside">
          <section className="panelbox split__side" aria-labelledby="appt-h">
            <div className="panelbox__head">
              <h3 className="panelbox__title" id="appt-h">Próximas citas</h3>
              {upcoming && <span className="panelbox__count">{upcoming.length}</span>}
            </div>

            {!upcoming ? (
              <p className="appt-empty">
                {upcomingError ? 'No pudimos cargar las citas.' : 'Cargando citas…'}
              </p>
            ) : upcoming.length === 0 ? (
              <p className="appt-empty">No tienes citas agendadas.</p>
            ) : (
              <ul className="appt-list">
                {upcoming.map((a) => {
                  const label = dayLabel(a.starts_at, now)
                  return (
                    <li key={a.id}>
                      <button
                        type="button"
                        className="appt appt--link"
                        onClick={() => navigate(`/proyectos/${a.project_id}`)}
                      >
                        <span className="appt__time">{formatTime(a.starts_at)}</span>
                        <span className="appt__body">
                          <span className="appt__client">{a.client_name}</span>
                          <span className="appt__detail">
                            {a.project_title}
                            {a.body_zone ? ` · ${a.body_zone}` : ''}
                          </span>
                        </span>
                        <span className={`appt__badge${label === 'Hoy' ? ' appt__badge--live' : ''}`}>
                          {label}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}

            <div className="appt-foot">
              <button type="button" className="panelbox__link" onClick={() => navigate('/citas')}>
                {upcoming?.length === 0 ? 'Agendar una cita' : 'Ver agenda completa'}
              </button>
            </div>
          </section>

          <section className="panelbox split__side" aria-labelledby="stock-h">
            <div className="panelbox__head">
              <h3 className="panelbox__title" id="stock-h">Stock bajo</h3>
              {lowStock && lowStock.length > 0 && (
                <span className="panelbox__count">{lowStock.length}</span>
              )}
            </div>

            {!lowStock ? (
              <p className="appt-empty">
                {lowStockError ? 'No pudimos cargar el inventario.' : 'Cargando inventario…'}
              </p>
            ) : lowStock.length === 0 ? (
              <p className="appt-empty">Todo en orden: ningún insumo en nivel crítico.</p>
            ) : (
              <ul className="appt-list">
                {lowStock.slice(0, LOW_STOCK_MAX).map((m) => (
                  <li key={m.id}>
                    <button type="button" className="appt appt--link" onClick={() => navigate('/inventario')}>
                      <span className="appt__body">
                        <span className="appt__client">{m.name}</span>
                        <span className="appt__detail">
                          Quedan {m.quantity} · crítico desde {m.min_quantity}
                        </span>
                      </span>
                      <span className="appt__badge appt__badge--warn">
                        {m.quantity === 0 ? 'Agotado' : 'Crítico'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="appt-foot">
              <button type="button" className="panelbox__link" onClick={() => navigate('/inventario')}>
                {lowStock && lowStock.length > LOW_STOCK_MAX
                  ? `Ver los ${lowStock.length} en Inventario`
                  : 'Ver inventario'}
              </button>
            </div>
          </section>
        </div>

      </div>

      {/* ---- Estadísticas (tarjetas pastel) ---- */}
      <section className="stats" aria-label="Resumen de actividad">
        {STATS.map((s) => {
          let value: number | string = s.value
          // Anotado a propósito: `STATS` es `as const`, así que sin esto `sub`
          // se estrecha a los literales del arreglo y no acepta los rótulos
          // que se calculan abajo.
          let sub: string = s.sub
          if (s.key === 'bocetos' && sketchCount !== null) {
            value = sketchCount
            sub = 'en total'
          } else if (s.key === 'citas' && monthStats !== null) {
            value = monthStats.total
            sub = `${monthStats.confirmadas} confirmadas`
          } else if (s.key === 'ingresos' && income !== null) {
            value = formatCLP(income.collected)
            sub = income.pending > 0 ? `${formatCLP(income.pending)} por cobrar` : 'nada por cobrar'
          } else if (s.key === 'clientes' && newClients !== null) {
            value = newClients
            sub = 'este mes'
          }
          return (
            <article className={`statcard${s.key === 'ingresos' ? ' statcard--money' : ''}`} key={s.key}>
              <span className="statcard__icon" aria-hidden="true">{icons[s.icon]}</span>
              <p className="statcard__value">{value}</p>
              <p className="statcard__label">{s.label}</p>
              <p className="statcard__sub">{sub}</p>
            </article>
          )
        })}
      </section>
    </div>
  )
}
