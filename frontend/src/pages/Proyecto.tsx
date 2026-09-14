import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { MoneyInput, SessionFields } from '../components/AgendaFields'
import { viewerIcons } from '../components/icons'
import { apiErrorMessage } from '../lib/api'
import {
  PROJECT_STATUSES,
  SESSION_STATUSES,
  addSessionPhoto,
  createSession,
  deleteProject,
  deleteSession,
  deleteSessionPhoto,
  formatAmountInput,
  formatCLP,
  formatDate,
  formatDuration,
  formatTime,
  getProject,
  parseCLP,
  projectStatusLabel,
  sessionStatusLabel,
  updateProject,
  updateSession,
  whatsappLink,
  type Project,
  type ProjectInput,
  type ProjectSession,
  type ProjectStatus,
  type SessionInput,
  type SessionPhoto,
  type SessionStatus,
} from '../lib/agenda'
import {
  formToSessionInput,
  newSessionForm,
  sessionToForm,
  type SessionFormValue,
} from '../lib/agendaForms'
import { listPreviews, type Preview } from '../lib/previews'
import { ALLOWED_MIME, MAX_FILE_BYTES, formatSize, listSketches, type Sketch } from '../lib/sketches'
import { useAppShellHeader } from '../lib/useAppShellHeader'
import './Studio.css'

const byStart = (a: ProjectSession, b: ProjectSession) => a.starts_at.localeCompare(b.starts_at)

interface DetailsForm {
  title: string
  status: ProjectStatus
  zone: string
  price: string
  description: string
}

const projectToForm = (p: Project): DetailsForm => ({
  title: p.title,
  status: p.status,
  zone: p.body_zone ?? '',
  price: formatAmountInput(p.total_price),
  description: p.description ?? '',
})

type SessionPatcher = (sessionId: string, change: (s: ProjectSession) => ProjectSession) => void

/**
 * Proyecto de un cliente (HU19): precio total, sesiones con su cobro, fotos del
 * avance de cada sesión (HU20) y el enlace al boceto y a la previsualización 3D.
 */
export default function Proyecto() {
  const { id = '' } = useParams()
  const navigate = useNavigate()

  const [project, setProject] = useState<Project | null>(null)
  const [sessions, setSessions] = useState<ProjectSession[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [notice, setNotice] = useState('')

  const [details, setDetails] = useState<DetailsForm | null>(null)
  const [savingDetails, setSavingDetails] = useState(false)
  const [detailsError, setDetailsError] = useState('')

  const [sketches, setSketches] = useState<Sketch[]>([])
  const [previews, setPreviews] = useState<Preview[]>([])
  const [linking, setLinking] = useState(false)

  const [adding, setAdding] = useState(false)
  const [newSession, setNewSession] = useState<SessionFormValue>(() => newSessionForm())
  const [creatingSession, setCreatingSession] = useState(false)
  const [sessionError, setSessionError] = useState('')

  const [zoomed, setZoomed] = useState<SessionPhoto | null>(null)

  useAppShellHeader({
    title: 'Proyecto',
    subtitle: project ? `${project.title} · ${project.client_name}` : undefined,
  })

  useEffect(() => {
    let cancelled = false
    getProject(id)
      .then((data) => {
        if (cancelled) return
        setProject(data.project)
        setSessions([...data.sessions].sort(byStart))
        setDetails(projectToForm(data.project))
        setLoadError('')
      })
      .catch((err) => {
        if (!cancelled) setLoadError(apiErrorMessage(err, 'No pudimos cargar el proyecto.'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  // Opciones para enlazar el diseño. Si fallan, la vista funciona igual.
  useEffect(() => {
    listSketches().then(setSketches).catch(() => setSketches([]))
    listPreviews().then(setPreviews).catch(() => setPreviews([]))
  }, [])

  useEffect(() => {
    if (!zoomed) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setZoomed(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [zoomed])

  /** Cambia una sesión por id. Funcional: varias subidas seguidas no se pisan. */
  const patchSession = useCallback<SessionPatcher>((sessionId, change) => {
    setSessions((list) => list.map((s) => (s.id === sessionId ? change(s) : s)).sort(byStart))
  }, [])

  // Las cuentas salen de las sesiones, así cambian al instante al marcar un pago.
  const money = useMemo(() => {
    let planned = 0
    let paid = 0
    for (const s of sessions) {
      if (s.status !== 'cancelada') planned += s.price
      if (s.paid) paid += s.price
    }
    return { planned, paid }
  }, [sessions])

  const total = project?.total_price ?? 0
  const balance = Math.max(0, total - money.paid)
  const unassigned = total - money.planned
  const paidPct = total > 0 ? Math.min(100, Math.round((money.paid / total) * 100)) : 0
  const wa = whatsappLink(project?.client_phone ?? null)

  async function saveDetails(e: React.FormEvent) {
    e.preventDefault()
    if (!project || !details) return
    if (!details.title.trim()) return setDetailsError('Ponle un nombre al proyecto.')

    setSavingDetails(true)
    setDetailsError('')
    try {
      const updated = await updateProject(project.id, {
        title: details.title.trim(),
        status: details.status,
        bodyZone: details.zone.trim() || null,
        totalPrice: parseCLP(details.price),
        description: details.description.trim() || null,
      })
      setProject(updated)
      setDetails(projectToForm(updated))
      setNotice('Proyecto actualizado.')
    } catch (err) {
      setDetailsError(apiErrorMessage(err, 'No pudimos guardar el proyecto.'))
    } finally {
      setSavingDetails(false)
    }
  }

  async function link(input: Pick<ProjectInput, 'sketchId' | 'previewId'>, message: string) {
    if (!project) return
    setLinking(true)
    try {
      setProject(await updateProject(project.id, input))
      setNotice(message)
    } catch (err) {
      setNotice(apiErrorMessage(err, 'No pudimos enlazarlo.'))
    } finally {
      setLinking(false)
    }
  }

  async function removeProject() {
    if (!project) return
    const extra = sessions.length ? ` Se borrarán sus ${sessions.length} sesiones y sus fotos.` : ''
    if (!window.confirm(`¿Eliminar «${project.title}»?${extra}`)) return
    try {
      await deleteProject(project.id)
      navigate(`/clientes/${project.client_id}`, { replace: true })
    } catch (err) {
      setNotice(apiErrorMessage(err, 'No pudimos eliminar el proyecto.'))
    }
  }

  function toggleAdding() {
    if (!adding) {
      // Sugiere cobrar en la nueva sesión lo que falta repartir del total.
      setNewSession((s) => ({ ...s, price: s.price || formatAmountInput(Math.max(0, unassigned)) }))
    }
    setAdding((v) => !v)
    setSessionError('')
  }

  async function addSession(e: React.FormEvent) {
    e.preventDefault()
    if (!project) return
    if (!newSession.date || !newSession.time) return setSessionError('Indica la fecha y la hora.')

    setCreatingSession(true)
    setSessionError('')
    try {
      const created = await createSession(project.id, formToSessionInput(newSession))
      setSessions((list) => [...list, created].sort(byStart))
      setNewSession(newSessionForm(newSession.date))
      setAdding(false)
      setNotice('Sesión agendada.')
    } catch (err) {
      setSessionError(apiErrorMessage(err, 'No pudimos agendar la sesión.'))
    } finally {
      setCreatingSession(false)
    }
  }

  async function removeSession(session: ProjectSession) {
    const extra = session.photos.length ? ` y sus ${session.photos.length} fotos` : ''
    if (!window.confirm(`¿Eliminar esta sesión${extra}?`)) return
    try {
      await deleteSession(session.id)
      setSessions((list) => list.filter((s) => s.id !== session.id))
      setNotice('Sesión eliminada.')
    } catch (err) {
      setNotice(apiErrorMessage(err, 'No pudimos eliminar la sesión.'))
    }
  }

  function assignmentHint() {
    if (total === 0) return 'Define el precio total del proyecto para llevar el saldo.'
    if (unassigned > 0) {
      return `Las sesiones suman ${formatCLP(money.planned)}: faltan ${formatCLP(unassigned)} por asignar a alguna sesión.`
    }
    if (unassigned < 0) {
      return `Las sesiones suman ${formatCLP(money.planned)}, ${formatCLP(-unassigned)} más que el precio total.`
    }
    return 'El precio total está repartido entre las sesiones.'
  }

  return (
    <div className="studio">
      <div className="st-body">
        <nav className="st-crumbs" aria-label="Ruta">
          <Link to="/clientes">Clientes</Link>
          <span aria-hidden="true">/</span>
          {project ? (
            <Link to={`/clientes/${project.client_id}`}>{project.client_name}</Link>
          ) : (
            <span>…</span>
          )}
          <span aria-hidden="true">/</span>
          <span>{project?.title ?? '…'}</span>
        </nav>

        {loading ? (
          <p className="st-empty">Cargando proyecto…</p>
        ) : loadError || !project || !details ? (
          <p className="st-empty st-empty--error" role="alert">
            {loadError || 'Proyecto no encontrado.'}
          </p>
        ) : (
          <>
            <header className="st-hero">
              <div>
                <h1 className="st-title">{project.title}</h1>
                <p className="st-sub">
                  <span className={`st-badge st-badge--${project.status}`}>
                    {projectStatusLabel(project.status)}
                  </span>
                  <Link to={`/clientes/${project.client_id}`}>{project.client_name}</Link>
                  {project.body_zone && <span>· {project.body_zone}</span>}
                </p>
              </div>
              <div className="st-actions st-actions--tight">
                {wa && (
                  <a className="st-btn" href={wa} target="_blank" rel="noreferrer">
                    WhatsApp
                  </a>
                )}
                <button
                  type="button"
                  className="st-btn st-btn--primary"
                  onClick={() => navigate(`/previsualizacion?proyecto=${project.id}`)}
                >
                  Ver en 3D
                </button>
              </div>
            </header>

            {notice && (
              <p className="st-notice" role="status" onAnimationEnd={() => setNotice('')}>
                {notice}
              </p>
            )}

            <div className="st-cols">
              <div className="st-stack">
                {/* ---------- Pagos ---------- */}
                <section className="st-panel" aria-labelledby="pay-h">
                  <h2 className="st-h" id="pay-h">Pagos</h2>
                  <dl className="st-money">
                    <div>
                      <dt>Precio total</dt>
                      <dd>{formatCLP(total)}</dd>
                    </div>
                    <div>
                      <dt>Pagado</dt>
                      <dd>{formatCLP(money.paid)}</dd>
                    </div>
                    <div>
                      <dt>Saldo</dt>
                      <dd className={balance ? 'is-due' : undefined}>{formatCLP(balance)}</dd>
                    </div>
                  </dl>
                  <div
                    className="st-progress"
                    role="progressbar"
                    aria-label="Porcentaje pagado"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={paidPct}
                  >
                    <span style={{ width: `${paidPct}%` }} />
                  </div>
                  <p className="st-hint">{assignmentHint()}</p>
                </section>

                {/* ---------- Diseño y 3D ---------- */}
                <section className="st-panel" aria-labelledby="dz-h">
                  <h2 className="st-h" id="dz-h">Diseño y previsualización</h2>
                  <div className="st-design">
                    {project.sketch_url ? (
                      <img className="st-design__img" src={project.sketch_url} alt="Boceto del proyecto" />
                    ) : (
                      <div className="st-design__img st-design__img--empty">Sin boceto</div>
                    )}
                    <div>
                      <div className="st-field">
                        <label className="st-label" htmlFor="pj-sketch">Boceto de la galería</label>
                        <select
                          id="pj-sketch"
                          className="st-input"
                          value={project.sketch_id ?? ''}
                          disabled={linking}
                          onChange={(e) =>
                            link({ sketchId: e.target.value || null }, e.target.value ? 'Boceto enlazado.' : 'Boceto quitado.')
                          }
                        >
                          <option value="">Sin boceto</option>
                          {sketches.map((s) => (
                            <option key={s.id} value={s.id}>{s.title}</option>
                          ))}
                        </select>
                      </div>
                      <div className="st-field">
                        <label className="st-label" htmlFor="pj-preview">Escena 3D</label>
                        <select
                          id="pj-preview"
                          className="st-input"
                          value={project.preview_id ?? ''}
                          disabled={linking}
                          onChange={(e) =>
                            link(
                              { previewId: e.target.value || null },
                              e.target.value ? 'Previsualización enlazada.' : 'Previsualización quitada.',
                            )
                          }
                        >
                          <option value="">Sin previsualización</option>
                          {previews.map((p) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="st-btn st-btn--block"
                    onClick={() => navigate(`/previsualizacion?proyecto=${project.id}`)}
                  >
                    {project.preview_id ? 'Ver el tatuaje sobre el cuerpo' : 'Probar el tatuaje en 3D'}
                  </button>
                  <p className="st-hint">
                    {project.preview_id
                      ? `Abre «${project.preview_name}» en el visor 3D.`
                      : project.sketch_id
                        ? 'El visor se abre con este boceto listo para colocar. Al guardar, la escena queda enlazada al proyecto.'
                        : 'Coloca un boceto sobre el modelo y guarda: la escena quedará enlazada a este proyecto.'}
                  </p>
                </section>

                {/* ---------- Datos del proyecto ---------- */}
                <section className="st-panel" aria-labelledby="dt-h">
                  <h2 className="st-h" id="dt-h">Datos del proyecto</h2>
                  <form onSubmit={saveDetails} noValidate>
                    <div className="st-field">
                      <label className="st-label" htmlFor="dt-title">Nombre</label>
                      <input
                        id="dt-title"
                        className="st-input"
                        value={details.title}
                        onChange={(e) => setDetails({ ...details, title: e.target.value })}
                      />
                    </div>
                    <div className="st-row">
                      <div className="st-field">
                        <label className="st-label" htmlFor="dt-status">Estado</label>
                        <select
                          id="dt-status"
                          className="st-input"
                          value={details.status}
                          onChange={(e) => setDetails({ ...details, status: e.target.value as ProjectStatus })}
                        >
                          {PROJECT_STATUSES.map((s) => (
                            <option key={s.value} value={s.value}>{s.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="st-field">
                        <label className="st-label" htmlFor="dt-price">Precio total</label>
                        <MoneyInput
                          id="dt-price"
                          value={details.price}
                          onChange={(price) => setDetails({ ...details, price })}
                        />
                      </div>
                    </div>
                    <div className="st-field">
                      <label className="st-label" htmlFor="dt-zone">Zona del cuerpo</label>
                      <input
                        id="dt-zone"
                        className="st-input"
                        value={details.zone}
                        onChange={(e) => setDetails({ ...details, zone: e.target.value })}
                      />
                    </div>
                    <div className="st-field">
                      <label className="st-label" htmlFor="dt-desc">Descripción</label>
                      <textarea
                        id="dt-desc"
                        className="st-input"
                        rows={3}
                        value={details.description}
                        onChange={(e) => setDetails({ ...details, description: e.target.value })}
                      />
                    </div>
                    {detailsError && <p className="st-alert" role="alert">{detailsError}</p>}
                    <div className="st-actions">
                      <button className="st-btn st-btn--primary" type="submit" disabled={savingDetails}>
                        {savingDetails ? 'Guardando…' : 'Guardar'}
                      </button>
                      <button className="st-btn st-btn--danger" type="button" onClick={removeProject}>
                        Eliminar proyecto
                      </button>
                    </div>
                  </form>
                </section>
              </div>

              {/* ---------- Sesiones ---------- */}
              <section className="st-panel" aria-labelledby="ss-h">
                <div className="st-panel__head">
                  <h2 className="st-h" id="ss-h">
                    Sesiones <span className="st-count">{sessions.length}</span>
                  </h2>
                  <button type="button" className="st-btn st-btn--sm" onClick={toggleAdding}>
                    {adding ? 'Cerrar' : '+ Agendar sesión'}
                  </button>
                </div>

                {adding && (
                  <form className="st-fieldset" onSubmit={addSession} noValidate>
                    <legend>Nueva sesión</legend>
                    <SessionFields idPrefix="ns" value={newSession} onChange={setNewSession} />
                    {sessionError && <p className="st-alert" role="alert">{sessionError}</p>}
                    <div className="st-actions st-actions--tight" style={{ marginBottom: 14 }}>
                      <button className="st-btn st-btn--primary" type="submit" disabled={creatingSession}>
                        {creatingSession ? 'Agendando…' : 'Agendar'}
                      </button>
                    </div>
                  </form>
                )}

                {sessions.length === 0 ? (
                  !adding && (
                    <p className="st-empty">Aún no hay sesiones. Agenda la primera.</p>
                  )
                ) : (
                  <ol className="st-sessions">
                    {sessions.map((s, i) => (
                      <SessionCard
                        key={s.id}
                        session={s}
                        number={i + 1}
                        onChange={patchSession}
                        onRemove={removeSession}
                        onZoom={setZoomed}
                        onNotice={setNotice}
                      />
                    ))}
                  </ol>
                )}
              </section>
            </div>
          </>
        )}
      </div>

      {zoomed && (
        <div
          className="st-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Foto del avance"
          onClick={() => setZoomed(null)}
        >
          <button
            type="button"
            className="st-lightbox__close"
            onClick={() => setZoomed(null)}
            aria-label="Cerrar"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
          <figure onClick={(e) => e.stopPropagation()}>
            <img src={zoomed.url} alt={zoomed.caption ?? 'Foto del avance del tatuaje'} />
            <figcaption>
              {zoomed.caption ? `${zoomed.caption} · ` : ''}
              {formatDate(zoomed.created_at)}
            </figcaption>
          </figure>
        </div>
      )}
    </div>
  )
}

/* ============================================================
   Tarjeta de sesión: cobro, estado, reagendar y fotos del avance
   ============================================================ */

interface SessionCardProps {
  session: ProjectSession
  number: number
  onChange: SessionPatcher
  onRemove: (session: ProjectSession) => void
  onZoom: (photo: SessionPhoto) => void
  onNotice: (message: string) => void
}

function SessionCard({ session, number, onChange, onRemove, onZoom, onNotice }: SessionCardProps) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<SessionFormValue>(() => sessionToForm(session))
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(0)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  async function patch(input: Partial<SessionInput>, message: string) {
    setBusy(true)
    setError('')
    try {
      const updated = await updateSession(session.id, input)
      // La respuesta no trae las fotos: se conservan las que ya había.
      onChange(session.id, (s) => ({ ...s, ...updated }))
      onNotice(message)
      return true
    } catch (err) {
      setError(apiErrorMessage(err, 'No pudimos actualizar la sesión.'))
      return false
    } finally {
      setBusy(false)
    }
  }

  function startEdit() {
    setForm(sessionToForm(session))
    setEditing(true)
    setError('')
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.date || !form.time) return setError('Indica la fecha y la hora.')
    if (await patch(formToSessionInput(form), 'Sesión actualizada.')) setEditing(false)
  }

  async function upload(fileList: FileList | null) {
    const files = Array.from(fileList ?? [])
    if (fileRef.current) fileRef.current.value = ''
    setError('')

    for (const file of files) {
      if (!ALLOWED_MIME.includes(file.type)) {
        setError(`«${file.name}»: formato no permitido. Usa JPG, PNG, WEBP o GIF.`)
        continue
      }
      if (file.size > MAX_FILE_BYTES) {
        setError(`«${file.name}» pesa ${formatSize(file.size)}; el máximo es 5 MB.`)
        continue
      }
      setUploading((n) => n + 1)
      try {
        const photo = await addSessionPhoto(session.id, file)
        onChange(session.id, (s) => ({ ...s, photos: [...s.photos, photo] }))
      } catch (err) {
        setError(`«${file.name}»: ${apiErrorMessage(err, 'no se pudo subir.')}`)
      } finally {
        setUploading((n) => n - 1)
      }
    }
  }

  async function removePhoto(photo: SessionPhoto) {
    if (!window.confirm('¿Eliminar esta foto?')) return
    try {
      await deleteSessionPhoto(session.id, photo.id)
      onChange(session.id, (s) => ({ ...s, photos: s.photos.filter((p) => p.id !== photo.id) }))
    } catch (err) {
      setError(apiErrorMessage(err, 'No pudimos eliminar la foto.'))
    }
  }

  return (
    <li className={`st-session st-session--${session.status}`}>
      <div className="st-session__head">
        <div>
          <p className="st-session__num">Sesión {number}</p>
          <p className="st-session__when">
            {formatDate(session.starts_at)} · {formatTime(session.starts_at)} ·{' '}
            {formatDuration(session.duration_minutes)}
          </p>
        </div>
        <span className={`st-badge st-badge--${session.status}`}>
          {sessionStatusLabel(session.status)}
        </span>
      </div>

      {editing ? (
        <form className="st-session__form" onSubmit={saveEdit} noValidate>
          <SessionFields idPrefix={`ed-${session.id}`} value={form} onChange={setForm} />
          <div className="st-actions st-actions--tight">
            <button className="st-btn st-btn--primary st-btn--sm" type="submit" disabled={busy}>
              {busy ? 'Guardando…' : 'Guardar'}
            </button>
            <button className="st-btn st-btn--sm" type="button" onClick={() => setEditing(false)}>
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <>
          <div className="st-session__pay">
            <span className="st-session__price">{formatCLP(session.price)}</span>
            <button
              type="button"
              className={`st-pill${session.paid ? ' st-pill--paid' : ''}`}
              aria-pressed={session.paid}
              disabled={busy}
              onClick={() =>
                patch(
                  { paid: !session.paid },
                  session.paid ? 'Sesión marcada como pendiente de pago.' : 'Sesión marcada como pagada.',
                )
              }
            >
              {session.paid ? 'Pagada ✓' : 'Marcar pagada'}
            </button>
          </div>
          {session.notes && <p className="st-session__notes">{session.notes}</p>}
        </>
      )}

      <ul className="st-photos" aria-label={`Fotos de la sesión ${number}`}>
        {session.photos.map((p) => (
          <li key={p.id} className="st-photo">
            <button type="button" className="st-photo__open" onClick={() => onZoom(p)}>
              <img src={p.url} alt={p.caption ?? `Avance de la sesión ${number}`} loading="lazy" />
            </button>
            <button
              type="button"
              className="st-photo__del"
              onClick={() => removePhoto(p)}
              aria-label="Eliminar foto"
            >
              {viewerIcons.trash}
            </button>
          </li>
        ))}
        <li>
          <label className={`st-photo st-photo--add${uploading ? ' is-busy' : ''}`}>
            <input
              ref={fileRef}
              type="file"
              accept={ALLOWED_MIME.join(',')}
              multiple
              disabled={uploading > 0}
              onChange={(e) => upload(e.target.files)}
            />
            {uploading ? 'Subiendo…' : '+ Foto del avance'}
          </label>
        </li>
      </ul>

      {error && <p className="st-alert" role="alert">{error}</p>}

      <div className="st-session__actions">
        <select
          className="st-input st-input--sm"
          value={session.status}
          disabled={busy}
          onChange={(e) => patch({ status: e.target.value as SessionStatus }, 'Estado de la sesión actualizado.')}
          aria-label={`Estado de la sesión ${number}`}
        >
          {SESSION_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        {!editing && (
          <button type="button" className="st-btn st-btn--sm" onClick={startEdit}>
            Reagendar / editar
          </button>
        )}
        <button type="button" className="st-btn st-btn--sm st-btn--danger" onClick={() => onRemove(session)}>
          Eliminar
        </button>
      </div>
    </li>
  )
}
