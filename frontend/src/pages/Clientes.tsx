import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ClientFields } from '../components/AgendaFields'
import { apiErrorMessage } from '../lib/api'
import { createClient, formatDate, listClients, type Client } from '../lib/agenda'
import { EMPTY_CLIENT_FORM, formToClientInput } from '../lib/agendaForms'
import { useAppShellHeader } from '../lib/useAppShellHeader'
import './Studio.css'

/** Cartera de clientes: alta con sus datos de contacto y buscador. */
export default function Clientes() {
  const navigate = useNavigate()

  const [query, setQuery] = useState('')
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [form, setForm] = useState(EMPTY_CLIENT_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  useAppShellHeader({
    title: 'Clientes',
    subtitle: `${clients.length} ${clients.length === 1 ? 'cliente' : 'clientes'}`,
  })

  useEffect(() => {
    let cancelled = false
    // Mientras se escribe se espera un momento antes de buscar.
    const timer = window.setTimeout(
      () => {
        listClients(query)
          .then((list) => {
            if (cancelled) return
            setClients(list)
            setLoadError('')
          })
          .catch((err) => {
            if (!cancelled) setLoadError(apiErrorMessage(err, 'No pudimos cargar los clientes.'))
          })
          .finally(() => {
            if (!cancelled) setLoading(false)
          })
      },
      query ? 250 : 0,
    )
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [query])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return setFormError('Escribe el nombre del cliente.')

    setSaving(true)
    setFormError('')
    try {
      const client = await createClient(formToClientInput(form))
      // A su ficha: lo siguiente suele ser crearle el proyecto.
      navigate(`/clientes/${client.id}`)
    } catch (err) {
      setFormError(apiErrorMessage(err, 'No pudimos crear el cliente.'))
      setSaving(false)
    }
  }

  return (
    <div className="studio">
      <div className="st-body">
        <div className="st-cols">
          {/* ---------- Alta ---------- */}
          <section className="st-panel" aria-labelledby="cl-new-h">
            <h2 className="st-h" id="cl-new-h">Nuevo cliente</h2>
            <form onSubmit={handleSubmit} noValidate>
              <ClientFields idPrefix="cl" value={form} onChange={setForm} />
              {formError && <p className="st-alert" role="alert">{formError}</p>}
              <div className="st-actions">
                <button className="st-btn st-btn--primary" type="submit" disabled={saving}>
                  {saving ? 'Guardando…' : 'Crear cliente'}
                </button>
              </div>
            </form>
          </section>

          {/* ---------- Lista ---------- */}
          <section className="st-panel" aria-labelledby="cl-list-h">
            <div className="st-panel__head">
              <h2 className="st-h" id="cl-list-h">
                Mis clientes <span className="st-count">{clients.length}</span>
              </h2>
              <input
                className="st-input st-input--search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por nombre o contacto…"
                aria-label="Buscar clientes"
              />
            </div>

            {loading ? (
              <p className="st-empty">Cargando clientes…</p>
            ) : loadError ? (
              <p className="st-empty st-empty--error" role="alert">{loadError}</p>
            ) : clients.length === 0 ? (
              <p className="st-empty">
                {query.trim()
                  ? 'Ningún cliente coincide con la búsqueda.'
                  : 'Todavía no tienes clientes. Crea el primero.'}
              </p>
            ) : (
              <ul className="st-list">
                {clients.map((c) => (
                  <li key={c.id}>
                    <Link className="st-item" to={`/clientes/${c.id}`}>
                      <span className="st-item__main">
                        <span className="st-item__title">{c.name}</span>
                        <span className="st-item__meta">
                          {[c.phone, c.instagram && `@${c.instagram}`, c.email]
                            .filter(Boolean)
                            .join(' · ') || 'Sin datos de contacto'}
                        </span>
                      </span>
                      <span className="st-item__side">
                        <span className="st-badge">
                          {c.projects_count} {c.projects_count === 1 ? 'proyecto' : 'proyectos'}
                        </span>
                        {c.next_session_at && <span>Próxima: {formatDate(c.next_session_at)}</span>}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
