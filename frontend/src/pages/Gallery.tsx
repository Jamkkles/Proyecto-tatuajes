import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getUser } from '../lib/auth'
import { ApiError } from '../lib/api'
import Atmos from '../components/Atmos'
import ThemeToggle from '../components/ThemeToggle'
import {
  ALLOWED_MIME,
  MAX_FILE_BYTES,
  SKETCH_STATUSES,
  createSketch,
  deleteSketch,
  formatSize,
  listSketches,
  updateSketch,
  type Sketch,
  type SketchStatus,
} from '../lib/sketches'
import './Gallery.css'

const EMPTY_FORM = {
  title: '',
  description: '',
  bodyZone: '',
  status: 'disponible' as SketchStatus,
  tags: '',
}

type Filter = 'todos' | SketchStatus

export default function Gallery() {
  const navigate = useNavigate()
  const user = getUser()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [sketches, setSketches] = useState<Sketch[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [filter, setFilter] = useState<Filter>('todos')
  const [tagFilter, setTagFilter] = useState('')

  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [form, setForm] = useState(EMPTY_FORM)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [formError, setFormError] = useState('')
  const [notice, setNotice] = useState('')

  // Se incrementa para forzar una recarga de la galería tras subir o borrar.
  const [reloadKey, setReloadKey] = useState(0)
  const reload = () => setReloadKey((k) => k + 1)

  useEffect(() => {
    let cancelled = false

    listSketches({
      status: filter === 'todos' ? undefined : filter,
      tag: tagFilter.trim() || undefined,
    })
      .then((list) => {
        if (cancelled) return
        setSketches(list)
        setLoadError('')
      })
      .catch((err) => {
        if (cancelled) return
        setLoadError(err instanceof ApiError ? err.message : 'No pudimos cargar la galería.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    // Evita que una respuesta lenta de un filtro anterior pise a la actual.
    return () => {
      cancelled = true
    }
  }, [filter, tagFilter, reloadKey])

  // La preview es una URL de objeto (blob): se libera al reemplazarla, al
  // descartar el archivo y al desmontar, o el navegador la mantiene en memoria.
  const previewRef = useRef('')
  function setPreviewFor(candidate: File | null) {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    previewRef.current = candidate ? URL.createObjectURL(candidate) : ''
    setPreview(previewRef.current)
  }
  useEffect(() => () => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current)
  }, [])

  /** Valida formato y peso antes de gastar una subida. */
  function pickFile(candidate: File | undefined) {
    if (!candidate) return

    if (!ALLOWED_MIME.includes(candidate.type)) {
      setFormError('Formato no permitido. Usa JPG, PNG, WEBP o GIF.')
      return
    }
    if (candidate.size > MAX_FILE_BYTES) {
      setFormError(`La imagen pesa ${formatSize(candidate.size)}; el máximo es 5 MB.`)
      return
    }

    setFormError('')
    setFile(candidate)
    setPreviewFor(candidate)
    // Sugiere el nombre del archivo como título si aún está vacío.
    setForm((f) => (f.title ? f : { ...f, title: candidate.name.replace(/\.[^.]+$/, '') }))
  }

  function resetForm() {
    setFile(null)
    setPreviewFor(null)
    setForm(EMPTY_FORM)
    setFormError('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file) return setFormError('Selecciona una imagen para subir.')
    if (!form.title.trim()) return setFormError('Ponle un título al boceto.')

    setUploading(true)
    setFormError('')
    try {
      await createSketch({
        file,
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        bodyZone: form.bodyZone.trim() || undefined,
        status: form.status,
        tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
      })
      resetForm()
      setNotice('Boceto subido.')
      reload()
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'No pudimos subir el boceto.')
    } finally {
      setUploading(false)
    }
  }

  async function handleStatusChange(sketch: Sketch, status: SketchStatus) {
    // Optimista: la tarjeta cambia al instante y se revierte si el backend falla.
    const previous = sketches
    setSketches((list) => list.map((s) => (s.id === sketch.id ? { ...s, status } : s)))
    try {
      await updateSketch(sketch.id, { status })
      // Si hay un filtro por estado activo, el boceto puede dejar de encajar.
      if (filter !== 'todos' && filter !== status) reload()
    } catch (err) {
      setSketches(previous)
      setNotice(err instanceof ApiError ? err.message : 'No pudimos actualizar el boceto.')
    }
  }

  async function handleDelete(sketch: Sketch) {
    if (!window.confirm(`¿Eliminar "${sketch.title}"? La imagen se borrará del almacenamiento.`)) {
      return
    }
    try {
      await deleteSketch(sketch.id)
      setSketches((list) => list.filter((s) => s.id !== sketch.id))
      setNotice('Boceto eliminado.')
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : 'No pudimos eliminar el boceto.')
    }
  }

  return (
    <div className="gal">
      <Atmos />

      <header className="gal__top">
        <button className="gal__back" type="button" onClick={() => navigate('/dashboard')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Panel
        </button>
        <div className="gal__titles">
          <h1 className="gal__title">Galería de bocetos</h1>
          <p className="gal__sub">
            {user?.name ? `${user.name} · ` : ''}
            {sketches.length} {sketches.length === 1 ? 'boceto' : 'bocetos'}
          </p>
        </div>
        <ThemeToggle className="gal__toggle" />
      </header>

      <div className="gal__body">
        {/* ---------- Importar ---------- */}
        <section className="uploader" aria-labelledby="up-h">
          <h2 className="uploader__h" id="up-h">Importar boceto</h2>

          <form onSubmit={handleSubmit}>
            <label
              className={`drop${dragging ? ' drop--over' : ''}${file ? ' drop--filled' : ''}`}
              onDragOver={(e) => {
                e.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragging(false)
                pickFile(e.dataTransfer.files[0])
              }}
            >
              <input
                ref={fileInputRef}
                className="drop__input"
                type="file"
                accept={ALLOWED_MIME.join(',')}
                onChange={(e) => pickFile(e.target.files?.[0])}
              />
              {preview ? (
                <>
                  <img className="drop__preview" src={preview} alt="Vista previa del boceto" />
                  <span className="drop__meta">
                    {file?.name} · {file ? formatSize(file.size) : ''}
                  </span>
                </>
              ) : (
                <>
                  <svg className="drop__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
                    <path d="M12 16V4M8 8l4-4 4 4" />
                    <path d="M4 15v3a2 2 0 002 2h12a2 2 0 002-2v-3" />
                  </svg>
                  <span className="drop__label">Arrastra una imagen o haz clic</span>
                  <span className="drop__hint">JPG · PNG · WEBP · GIF — hasta 5 MB</span>
                </>
              )}
            </label>

            <div className="field">
              <label className="field__label" htmlFor="up-title">Título</label>
              <input
                className="field__input"
                id="up-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Dragón oriental"
              />
            </div>

            <div className="field">
              <label className="field__label" htmlFor="up-desc">Descripción</label>
              <textarea
                className="field__input field__input--area"
                id="up-desc"
                rows={2}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Línea fina, sombreado suave…"
              />
            </div>

            <div className="field-row">
              <div className="field">
                <label className="field__label" htmlFor="up-zone">Zona del cuerpo</label>
                <input
                  className="field__input"
                  id="up-zone"
                  value={form.bodyZone}
                  onChange={(e) => setForm({ ...form, bodyZone: e.target.value })}
                  placeholder="Antebrazo"
                />
              </div>
              <div className="field">
                <label className="field__label" htmlFor="up-status">Estado</label>
                <select
                  className="field__input"
                  id="up-status"
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as SketchStatus })}
                >
                  {SKETCH_STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="field">
              <label className="field__label" htmlFor="up-tags">Etiquetas</label>
              <input
                className="field__input"
                id="up-tags"
                value={form.tags}
                onChange={(e) => setForm({ ...form, tags: e.target.value })}
                placeholder="irezumi, blackwork"
              />
              <span className="field__hint">Sepáralas con comas.</span>
            </div>

            {formError && <p className="alert" role="alert">{formError}</p>}

            <div className="uploader__actions">
              <button className="btn btn--primary" type="submit" disabled={uploading}>
                {uploading ? 'Subiendo…' : 'Subir boceto'}
              </button>
              {file && (
                <button className="btn" type="button" onClick={resetForm} disabled={uploading}>
                  Descartar
                </button>
              )}
            </div>
          </form>
        </section>

        {/* ---------- Galería ---------- */}
        <section className="grid-wrap" aria-labelledby="gal-h">
          <div className="grid-wrap__head">
            <h2 className="uploader__h" id="gal-h">Mis bocetos</h2>
            <div className="filters">
              {(['todos', ...SKETCH_STATUSES.map((s) => s.value)] as Filter[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  className={`chip${filter === f ? ' chip--on' : ''}`}
                  onClick={() => setFilter(f)}
                >
                  {f === 'todos' ? 'Todos' : SKETCH_STATUSES.find((s) => s.value === f)?.label}
                </button>
              ))}
              <input
                className="filters__tag"
                value={tagFilter}
                onChange={(e) => setTagFilter(e.target.value)}
                placeholder="Filtrar por etiqueta…"
                aria-label="Filtrar por etiqueta"
              />
            </div>
          </div>

          {notice && (
            <p className="notice" role="status" onAnimationEnd={() => setNotice('')}>{notice}</p>
          )}

          {loading ? (
            <p className="state">Cargando galería…</p>
          ) : loadError ? (
            <p className="state state--error" role="alert">{loadError}</p>
          ) : sketches.length === 0 ? (
            <p className="state">
              {filter === 'todos' && !tagFilter
                ? 'Todavía no has subido bocetos. Empieza importando uno.'
                : 'Ningún boceto coincide con el filtro.'}
            </p>
          ) : (
            <ul className="grid">
              {sketches.map((s) => (
                <li className="card" key={s.id}>
                  <div className="card__media">
                    <img className="card__img" src={s.url} alt={s.title} loading="lazy" width={320} height={240} />
                    <span className={`badge badge--${s.status}`}>{s.status}</span>
                  </div>

                  <div className="card__body">
                    <h3 className="card__title">{s.title}</h3>
                    {s.body_zone && <p className="card__zone">{s.body_zone}</p>}
                    {s.description && <p className="card__desc">{s.description}</p>}

                    {s.tags.length > 0 && (
                      <ul className="tags">
                        {s.tags.map((t) => (
                          <li className="tag" key={t}>
                            <button type="button" onClick={() => setTagFilter(t)}>{t}</button>
                          </li>
                        ))}
                      </ul>
                    )}

                    <p className="card__meta">
                      {s.width && s.height ? `${s.width}×${s.height} · ` : ''}
                      {formatSize(s.size_bytes)}
                    </p>

                    <div className="card__actions">
                      <select
                        className="card__select"
                        value={s.status}
                        onChange={(e) => handleStatusChange(s, e.target.value as SketchStatus)}
                        aria-label={`Estado de ${s.title}`}
                      >
                        {SKETCH_STATUSES.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                      <button
                        className="card__del"
                        type="button"
                        onClick={() => handleDelete(s)}
                        aria-label={`Eliminar ${s.title}`}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                          <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13a1 1 0 001 1h8a1 1 0 001-1l1-13M9 7V4h6v3" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
