import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import MonthCalendar from '../components/MonthCalendar'
import { MoneyInput, SessionFields } from '../components/AgendaFields'
import { apiErrorMessage } from '../lib/api'
import {
  countSessionsByDay,
  createClient,
  createProject,
  createSession,
  formatCLP,
  formatDuration,
  formatTime,
  listClients,
  listProjects,
  listSessions,
  parseCLP,
  sessionStatusLabel,
  type CalendarSession,
  type Client,
  type Project,
} from '../lib/agenda'
import { formToSessionInput, newSessionForm, type SessionFormValue } from '../lib/agendaForms'
import { buildMonthGrid, isIsoDay, isoLocal } from '../lib/dates'
import { useAppShellHeader } from '../lib/useAppShellHeader'
// MonthCalendar reutiliza el chrome de `.panelbox` del panel.
import './Dashboard.css'
import './Studio.css'

/** Valor de los <select> que significa «crear uno nuevo». */
const NEW = '__nuevo__'

const dayFmt = new Intl.DateTimeFormat('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })

const EMPTY_NEW_CLIENT = { name: '', phone: '' }
const EMPTY_NEW_PROJECT = { title: '', price: '', zone: '' }

/**
 * Agenda (HU17, HU18): calendario del mes con las citas de cada día y el
 * formulario para agendar. Una cita es una sesión de un proyecto; si el
 * cliente o el proyecto aún no existen, se crean en el mismo paso.
 */
export default function Citas() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  // `/citas?dia=YYYY-MM-DD` (desde el calendario del panel) abre ese día.
  const [initialDay] = useState(() => {
    const dia = searchParams.get('dia')
    return isIsoDay(dia) ? dia : isoLocal(new Date())
  })

  /* ---- Calendario ---- */
  const [selectedDay, setSelectedDay] = useState(initialDay)
  // MonthCalendar guarda su mes por dentro: para saltar a otra fecha (la de la
  // cita recién creada) se vuelve a montar con otra `key`.
  const [calendarKey, setCalendarKey] = useState(0)
  const [range, setRange] = useState<{ from: Date; to: Date } | null>(null)
  const [sessions, setSessions] = useState<CalendarSession[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  /* ---- Nueva cita ---- */
  const [clients, setClients] = useState<Client[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  // `/citas?cliente=<id>` (desde la ficha del cliente) llega con él elegido.
  const [clientId, setClientId] = useState(() => searchParams.get('cliente') ?? '')
  const [projectId, setProjectId] = useState('')
  const [newClient, setNewClient] = useState(EMPTY_NEW_CLIENT)
  const [newProject, setNewProject] = useState(EMPTY_NEW_PROJECT)
  const [session, setSession] = useState<SessionFormValue>(() => newSessionForm(initialDay))
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [notice, setNotice] = useState('')
  /** Descarta respuestas de proyectos de un cliente elegido antes. */
  const projectsReqRef = useRef(0)

  useAppShellHeader({ title: 'Citas', subtitle: 'Agenda del estudio' })

  const onMonthChange = useCallback((year: number, month: number) => {
    const grid = buildMonthGrid(year, month)
    const last = grid[grid.length - 1]
    // También los días de los meses vecinos que asoman en la grilla.
    setRange({
      from: grid[0],
      to: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1),
    })
  }, [])

  useEffect(() => {
    if (!range) return
    let cancelled = false
    listSessions(range.from, range.to)
      .then((list) => {
        if (cancelled) return
        setSessions(list)
        setLoadError('')
      })
      .catch((err) => {
        if (!cancelled) setLoadError(apiErrorMessage(err, 'No pudimos cargar la agenda.'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [range])

  function chooseClient(id: string) {
    setClientId(id)
    setProjectId(id === NEW ? NEW : '')
    setProjects([])
    setFormError('')
    if (id && id !== NEW) loadProjects(id)
  }

  /** Proyectos activos del cliente elegido (el estado solo cambia al responder). */
  function loadProjects(id: string) {
    const req = ++projectsReqRef.current
    listProjects({ clientId: id, status: 'activo' })
      .then((list) => {
        if (req !== projectsReqRef.current) return
        setProjects(list)
        // Un solo proyecto activo: es ese. Ninguno: lo natural es crearlo.
        setProjectId(list.length === 1 ? list[0].id : list.length === 0 ? NEW : '')
      })
      .catch(() => {
        if (req === projectsReqRef.current) setProjects([])
      })
  }

  // Clientes para el selector y, si se llegó con uno elegido, sus proyectos.
  useEffect(() => {
    listClients()
      .then(setClients)
      .catch(() => setClients([]))
    if (clientId) loadProjects(clientId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const countsByDay = useMemo(() => countSessionsByDay(sessions), [sessions])

  const daySessions = sessions.filter((s) => isoLocal(new Date(s.starts_at)) === selectedDay)
  const dayActive = daySessions.filter((s) => s.status !== 'cancelada').length
  const dayLabel = dayFmt.format(new Date(`${selectedDay}T00:00:00`))

  function pickDay(iso: string) {
    setSelectedDay(iso)
    // Elegir un día en el calendario también fija la fecha de la nueva cita.
    setSession((s) => ({ ...s, date: iso }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const creatingClient = clientId === NEW
    const creatingProject = creatingClient || projectId === NEW

    if (!clientId) return setFormError('Elige un cliente o crea uno nuevo.')
    if (creatingClient && !newClient.name.trim()) return setFormError('Escribe el nombre del cliente.')
    if (!creatingProject && !projectId) return setFormError('Elige un proyecto o crea uno nuevo.')
    if (creatingProject && !newProject.title.trim()) return setFormError('Ponle un nombre al proyecto.')
    if (!session.date || !session.time) return setFormError('Indica la fecha y la hora de la cita.')

    setSaving(true)
    setFormError('')
    let targetClient = clientId
    let targetProject = projectId
    try {
      // Cada paso que termina queda fijado en el formulario: si falla uno
      // posterior, reintentar no duplica el cliente ni el proyecto.
      if (creatingClient) {
        const client = await createClient({
          name: newClient.name.trim(),
          phone: newClient.phone.trim() || null,
        })
        targetClient = client.id
        setClients((list) => [...list, client].sort((a, b) => a.name.localeCompare(b.name, 'es')))
        setClientId(client.id)
        setNewClient(EMPTY_NEW_CLIENT)
      }
      if (creatingProject) {
        const project = await createProject(targetClient, {
          title: newProject.title.trim(),
          totalPrice: parseCLP(newProject.price),
          bodyZone: newProject.zone.trim() || null,
        })
        targetProject = project.id
        setProjects((list) => [project, ...list])
        setProjectId(project.id)
        setNewProject(EMPTY_NEW_PROJECT)
      }

      await createSession(targetProject, formToSessionInput(session))

      setNotice('Cita agendada.')
      setSelectedDay(session.date)
      setCalendarKey((k) => k + 1) // salta al mes de la cita y recarga
      setClientId('')
      setProjectId('')
      setProjects([])
      setSession(newSessionForm(session.date))
    } catch (err) {
      setFormError(apiErrorMessage(err, 'No pudimos agendar la cita.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="studio">
      <div className="st-body">
        <div className="st-cols st-cols--agenda">
          {/* ---------- Calendario + citas del día ---------- */}
          <div className="st-stack">
            <MonthCalendar
              key={calendarKey}
              appointmentsByDay={countsByDay}
              initialSelected={selectedDay}
              onSelectDay={pickDay}
              onMonthChange={onMonthChange}
            />

            <section className="st-panel" aria-labelledby="day-h">
              <div className="st-panel__head">
                <h2 className="st-h" id="day-h">
                  {dayLabel} <span className="st-count">{dayActive}</span>
                </h2>
                <Link className="st-link" to="/clientes">Ver clientes</Link>
              </div>

              {loading ? (
                <p className="st-empty">Cargando agenda…</p>
              ) : loadError ? (
                <p className="st-empty st-empty--error" role="alert">{loadError}</p>
              ) : daySessions.length === 0 ? (
                <p className="st-empty">Sin citas este día.</p>
              ) : (
                <ul className="st-list">
                  {daySessions.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        className={`st-item st-appt${s.status === 'cancelada' ? ' st-appt--off' : ''}`}
                        onClick={() => navigate(`/proyectos/${s.project_id}`)}
                      >
                        <span className="st-appt__time">
                          {formatTime(s.starts_at)}
                          <small>{formatDuration(s.duration_minutes)}</small>
                        </span>
                        <span className="st-item__main">
                          <span className="st-item__title">{s.client_name}</span>
                          <span className="st-item__meta">
                            {s.project_title}
                            {s.body_zone ? ` · ${s.body_zone}` : ''}
                          </span>
                        </span>
                        <span className="st-item__side">
                          <span className={`st-badge st-badge--${s.status}`}>
                            {sessionStatusLabel(s.status)}
                          </span>
                          <span>
                            {formatCLP(s.price)}
                            {s.price > 0 ? (s.paid ? ' · pagada' : ' · por pagar') : ''}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {/* ---------- Nueva cita ---------- */}
          <section className="st-panel" aria-labelledby="new-h">
            <h2 className="st-h" id="new-h">Nueva cita</h2>

            {notice && (
              <p className="st-notice" role="status" onAnimationEnd={() => setNotice('')}>
                {notice}
              </p>
            )}

            <form onSubmit={handleSubmit} noValidate>
              <div className="st-field">
                <label className="st-label" htmlFor="ap-client">Cliente</label>
                <select
                  id="ap-client"
                  className="st-input"
                  value={clientId}
                  onChange={(e) => chooseClient(e.target.value)}
                >
                  <option value="">Elige un cliente…</option>
                  <option value={NEW}>+ Nuevo cliente</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.phone ? ` · ${c.phone}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {clientId === NEW && (
                <fieldset className="st-fieldset">
                  <legend>Nuevo cliente</legend>
                  <div className="st-field">
                    <label className="st-label" htmlFor="ap-cname">Nombre</label>
                    <input
                      id="ap-cname"
                      className="st-input"
                      value={newClient.name}
                      onChange={(e) => setNewClient({ ...newClient, name: e.target.value })}
                      placeholder="Camila Rojas"
                      autoComplete="off"
                    />
                  </div>
                  <div className="st-field">
                    <label className="st-label" htmlFor="ap-cphone">Teléfono / WhatsApp</label>
                    <input
                      id="ap-cphone"
                      className="st-input"
                      type="tel"
                      value={newClient.phone}
                      onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })}
                      placeholder="+56 9 1234 5678"
                    />
                  </div>
                </fieldset>
              )}

              {clientId && clientId !== NEW && (
                <div className="st-field">
                  <label className="st-label" htmlFor="ap-project">Proyecto</label>
                  <select
                    id="ap-project"
                    className="st-input"
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                  >
                    <option value="">Elige un proyecto…</option>
                    <option value={NEW}>+ Nuevo proyecto</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title} · {formatCLP(p.total_price)}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {clientId && (clientId === NEW || projectId === NEW) && (
                <fieldset className="st-fieldset">
                  <legend>Nuevo proyecto</legend>
                  <div className="st-field">
                    <label className="st-label" htmlFor="ap-ptitle">Nombre del proyecto</label>
                    <input
                      id="ap-ptitle"
                      className="st-input"
                      value={newProject.title}
                      onChange={(e) => setNewProject({ ...newProject, title: e.target.value })}
                      placeholder="Manga irezumi"
                      autoComplete="off"
                    />
                  </div>
                  <div className="st-row">
                    <div className="st-field">
                      <label className="st-label" htmlFor="ap-pprice">Precio total</label>
                      <MoneyInput
                        id="ap-pprice"
                        value={newProject.price}
                        onChange={(price) => setNewProject({ ...newProject, price })}
                      />
                    </div>
                    <div className="st-field">
                      <label className="st-label" htmlFor="ap-pzone">Zona</label>
                      <input
                        id="ap-pzone"
                        className="st-input"
                        value={newProject.zone}
                        onChange={(e) => setNewProject({ ...newProject, zone: e.target.value })}
                        placeholder="Antebrazo"
                      />
                    </div>
                  </div>
                </fieldset>
              )}

              <SessionFields idPrefix="ap" value={session} onChange={setSession} />

              {formError && <p className="st-alert" role="alert">{formError}</p>}

              <div className="st-actions">
                <button className="st-btn st-btn--primary" type="submit" disabled={saving}>
                  {saving ? 'Agendando…' : 'Agendar cita'}
                </button>
              </div>
            </form>
          </section>
        </div>
      </div>
    </div>
  )
}
