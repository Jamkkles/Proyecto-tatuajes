import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ClientFields, MoneyInput } from '../components/AgendaFields'
import { apiErrorMessage } from '../lib/api'
import {
  createProject,
  deleteClient,
  formatCLP,
  formatDate,
  getClient,
  parseCLP,
  projectStatusLabel,
  updateClient,
  whatsappLink,
  type Client,
  type Project,
} from '../lib/agenda'
import { EMPTY_CLIENT_FORM, clientToForm, formToClientInput } from '../lib/agendaForms'
import { useAppShellHeader } from '../lib/useAppShellHeader'
import './Studio.css'

const EMPTY_PROJECT = { title: '', price: '', zone: '', description: '' }

/** Ficha del cliente: contacto, historial de proyectos (HU24) y alta de proyecto (HU19). */
export default function Cliente() {
  const { id = '' } = useParams()
  const navigate = useNavigate()

  const [client, setClient] = useState<Client | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [notice, setNotice] = useState('')

  const [contact, setContact] = useState(EMPTY_CLIENT_FORM)
  const [savingContact, setSavingContact] = useState(false)
  const [contactError, setContactError] = useState('')

  const [projectForm, setProjectForm] = useState(EMPTY_PROJECT)
  const [creating, setCreating] = useState(false)
  const [projectError, setProjectError] = useState('')

  useAppShellHeader({ title: 'Ficha del cliente', subtitle: client?.name })

  useEffect(() => {
    let cancelled = false
    getClient(id)
      .then((data) => {
        if (cancelled) return
        setClient(data.client)
        setProjects(data.projects)
        setContact(clientToForm(data.client))
        setLoadError('')
      })
      .catch((err) => {
        if (!cancelled) setLoadError(apiErrorMessage(err, 'No pudimos cargar el cliente.'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  async function saveContact(e: React.FormEvent) {
    e.preventDefault()
    if (!client) return
    if (!contact.name.trim()) return setContactError('El nombre no puede quedar vacío.')

    setSavingContact(true)
    setContactError('')
    try {
      const updated = await updateClient(client.id, formToClientInput(contact))
      setClient(updated)
      setContact(clientToForm(updated))
      setNotice('Datos del cliente guardados.')
    } catch (err) {
      setContactError(apiErrorMessage(err, 'No pudimos guardar los datos.'))
    } finally {
      setSavingContact(false)
    }
  }

  async function removeClient() {
    if (!client) return
    const extra = projects.length
      ? ` También se borrarán sus ${projects.length} proyectos, sesiones y fotos.`
      : ''
    if (!window.confirm(`¿Eliminar a ${client.name}?${extra}`)) return
    try {
      await deleteClient(client.id)
      navigate('/clientes', { replace: true })
    } catch (err) {
      setNotice(apiErrorMessage(err, 'No pudimos eliminar el cliente.'))
    }
  }

  async function addProject(e: React.FormEvent) {
    e.preventDefault()
    if (!client) return
    if (!projectForm.title.trim()) return setProjectError('Ponle un nombre al proyecto.')

    setCreating(true)
    setProjectError('')
    try {
      const project = await createProject(client.id, {
        title: projectForm.title.trim(),
        totalPrice: parseCLP(projectForm.price),
        bodyZone: projectForm.zone.trim() || null,
        description: projectForm.description.trim() || null,
      })
      // En el proyecto se agendan sus sesiones.
      navigate(`/proyectos/${project.id}`)
    } catch (err) {
      setProjectError(apiErrorMessage(err, 'No pudimos crear el proyecto.'))
      setCreating(false)
    }
  }

  const paid = projects.reduce((sum, p) => sum + p.paid_amount, 0)
  const pending = projects
    .filter((p) => p.status !== 'cancelado')
    .reduce((sum, p) => sum + Math.max(0, p.total_price - p.paid_amount), 0)
  const wa = whatsappLink(client?.phone ?? null)

  return (
    <div className="studio">
      <div className="st-body">
        <nav className="st-crumbs" aria-label="Ruta">
          <Link to="/clientes">Clientes</Link>
          <span aria-hidden="true">/</span>
          <span>{client?.name ?? '…'}</span>
        </nav>

        {loading ? (
          <p className="st-empty">Cargando cliente…</p>
        ) : loadError || !client ? (
          <p className="st-empty st-empty--error" role="alert">
            {loadError || 'Cliente no encontrado.'}
          </p>
        ) : (
          <>
            <header className="st-hero">
              <div>
                <h1 className="st-title">{client.name}</h1>
                <p className="st-sub">Cliente desde {formatDate(client.created_at)}</p>
              </div>
              <div className="st-actions st-actions--tight">
                {wa && (
                  <a className="st-btn" href={wa} target="_blank" rel="noreferrer">
                    WhatsApp
                  </a>
                )}
                <Link className="st-btn st-btn--primary" to={`/citas?cliente=${client.id}`}>
                  Agendar cita
                </Link>
              </div>
            </header>

            {notice && (
              <p className="st-notice" role="status" onAnimationEnd={() => setNotice('')}>
                {notice}
              </p>
            )}

            <div className="st-cols">
              {/* ---------- Contacto ---------- */}
              <section className="st-panel" aria-labelledby="ct-h">
                <h2 className="st-h" id="ct-h">Datos de contacto</h2>
                <form onSubmit={saveContact} noValidate>
                  <ClientFields idPrefix="ct" value={contact} onChange={setContact} />
                  {contactError && <p className="st-alert" role="alert">{contactError}</p>}
                  <div className="st-actions">
                    <button className="st-btn st-btn--primary" type="submit" disabled={savingContact}>
                      {savingContact ? 'Guardando…' : 'Guardar'}
                    </button>
                    <button className="st-btn st-btn--danger" type="button" onClick={removeClient}>
                      Eliminar cliente
                    </button>
                  </div>
                </form>
              </section>

              <div className="st-stack">
                {/* ---------- Historial de proyectos ---------- */}
                <section className="st-panel" aria-labelledby="pj-h">
                  <h2 className="st-h" id="pj-h">
                    Proyectos <span className="st-count">{projects.length}</span>
                  </h2>

                  {projects.length > 0 && (
                    <dl className="st-money">
                      <div>
                        <dt>Pagado</dt>
                        <dd>{formatCLP(paid)}</dd>
                      </div>
                      <div>
                        <dt>Por cobrar</dt>
                        <dd className={pending ? 'is-due' : undefined}>{formatCLP(pending)}</dd>
                      </div>
                      <div>
                        <dt>Activos</dt>
                        <dd>{projects.filter((p) => p.status === 'activo').length}</dd>
                      </div>
                    </dl>
                  )}

                  {projects.length === 0 ? (
                    <p className="st-empty">Aún no tiene proyectos. Crea el primero abajo.</p>
                  ) : (
                    <ul className="st-list">
                      {projects.map((p) => (
                        <li key={p.id}>
                          <Link
                            className={`st-item${p.sketch_url ? ' st-item--thumb' : ''}`}
                            to={`/proyectos/${p.id}`}
                          >
                            {p.sketch_url && (
                              <img className="st-item__thumb" src={p.sketch_url} alt="" loading="lazy" />
                            )}
                            <span className="st-item__main">
                              <span className="st-item__title">{p.title}</span>
                              <span className="st-item__meta">
                                {p.sessions_count} {p.sessions_count === 1 ? 'sesión' : 'sesiones'}
                                {p.body_zone ? ` · ${p.body_zone}` : ''}
                                {p.next_session_at ? ` · próxima ${formatDate(p.next_session_at)}` : ''}
                              </span>
                            </span>
                            <span className="st-item__side">
                              <span className={`st-badge st-badge--${p.status}`}>
                                {projectStatusLabel(p.status)}
                              </span>
                              <span>
                                {formatCLP(p.paid_amount)} de {formatCLP(p.total_price)}
                              </span>
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                {/* ---------- Nuevo proyecto ---------- */}
                <section className="st-panel" aria-labelledby="np-h">
                  <h2 className="st-h" id="np-h">Nuevo proyecto</h2>
                  <form onSubmit={addProject} noValidate>
                    <div className="st-field">
                      <label className="st-label" htmlFor="np-title">Nombre del proyecto</label>
                      <input
                        id="np-title"
                        className="st-input"
                        value={projectForm.title}
                        onChange={(e) => setProjectForm({ ...projectForm, title: e.target.value })}
                        placeholder="Manga irezumi"
                        autoComplete="off"
                      />
                    </div>
                    <div className="st-row">
                      <div className="st-field">
                        <label className="st-label" htmlFor="np-price">Precio total</label>
                        <MoneyInput
                          id="np-price"
                          value={projectForm.price}
                          onChange={(price) => setProjectForm({ ...projectForm, price })}
                        />
                      </div>
                      <div className="st-field">
                        <label className="st-label" htmlFor="np-zone">Zona del cuerpo</label>
                        <input
                          id="np-zone"
                          className="st-input"
                          value={projectForm.zone}
                          onChange={(e) => setProjectForm({ ...projectForm, zone: e.target.value })}
                          placeholder="Brazo izquierdo"
                        />
                      </div>
                    </div>
                    <div className="st-field">
                      <label className="st-label" htmlFor="np-desc">Descripción</label>
                      <textarea
                        id="np-desc"
                        className="st-input"
                        rows={2}
                        value={projectForm.description}
                        onChange={(e) => setProjectForm({ ...projectForm, description: e.target.value })}
                        placeholder="Koi con olas, black & grey…"
                      />
                    </div>
                    {projectError && <p className="st-alert" role="alert">{projectError}</p>}
                    <div className="st-actions">
                      <button className="st-btn st-btn--primary" type="submit" disabled={creating}>
                        {creating ? 'Creando…' : 'Crear proyecto'}
                      </button>
                    </div>
                  </form>
                </section>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
