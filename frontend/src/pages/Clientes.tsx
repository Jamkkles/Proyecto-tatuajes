import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ClientFields } from '../components/AgendaFields'
import RatingStars from '../components/RatingStars'
import { apiErrorMessage } from '../lib/api'
import { createClient, formatDate, listClients, type Client } from '../lib/agenda'
import { EMPTY_CLIENT_FORM, formToClientInput } from '../lib/agendaForms'
import {
  RATING_FILTERS,
  attendanceText,
  formatAverage,
  matchesRating,
  starsFor,
  type RatingFilter,
} from '../lib/ratings'
import { useAppShellHeader } from '../lib/useAppShellHeader'
import './Studio.css'

/**
 * Cartera de clientes: alta con sus datos de contacto, buscador y filtro por puntaje (HU30). El
 * servidor ya los entrega del mejor promedio al peor, y los sin calificar al final.
 */
export default function Clientes() {
  const navigate = useNavigate()

  const [query, setQuery] = useState('')
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [ratingFilter, setRatingFilter] = useState<RatingFilter>('todos')

  const [form, setForm] = useState(EMPTY_CLIENT_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  // El filtro por puntaje se aplica aquí: la lista de un artista es corta y así cambiar de
  // filtro es instantáneo. El buscador sí consulta al servidor.
  const visible = useMemo(() => clients.filter((c) => matchesRating(c.rating_avg, ratingFilter)), [clients, ratingFilter])
  const filterCounts = useMemo(
    () => Object.fromEntries(RATING_FILTERS.map((f) => [f.value, clients.filter((c) => matchesRating(c.rating_avg, f.value)).length])),
    [clients],
  )

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
                Mis clientes <span className="st-count">{visible.length}</span>
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

            {clients.length > 0 && (
              <div className="st-chips" role="group" aria-label="Filtrar por puntaje promedio">
                {RATING_FILTERS.map((f) => (
                  <button
                    key={f.value}
                    type="button"
                    className={`st-chip${ratingFilter === f.value ? ' is-active' : ''}`}
                    aria-pressed={ratingFilter === f.value}
                    onClick={() => setRatingFilter(f.value)}
                  >
                    {f.label} <span className="st-chip__n">{filterCounts[f.value]}</span>
                  </button>
                ))}
              </div>
            )}

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
            ) : visible.length === 0 ? (
              <p className="st-empty">Ningún cliente está en ese grupo.</p>
            ) : (
              <ul className="st-list">
                {visible.map((c) => (
                  <li key={c.id}>
                    <Link className="st-item" to={`/clientes/${c.id}`}>
                      <span className="st-item__main">
                        <span className="st-item__title">{c.name}</span>
                        <span className="st-item__meta">
                          {[c.phone, c.instagram && `@${c.instagram}`, c.email]
                            .filter(Boolean)
                            .join(' · ') || 'Sin datos de contacto'}
                        </span>
                        {attendanceText(c) && <span className="st-item__meta">{attendanceText(c)}</span>}
                      </span>
                      <span className="st-item__side">
                        <RatingStars value={starsFor(c.rating_avg)} />
                        {c.rating_avg !== null && (
                          <span title={`Promedio de ${c.rating_count} ${c.rating_count === 1 ? 'sesión calificada' : 'sesiones calificadas'}`}>
                            {formatAverage(c.rating_avg)} · {c.rating_count} calif.
                          </span>
                        )}
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
