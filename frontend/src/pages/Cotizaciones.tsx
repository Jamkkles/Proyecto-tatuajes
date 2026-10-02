import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { apiErrorMessage } from '../lib/api'
import { formatDuration, listProjects, type Project } from '../lib/agenda'
import { listMaterials, isConsumable, type Material } from '../lib/materials'
import { formatCLP } from '../lib/money'
import { getPreview } from '../lib/previews'
import {
  COLOR_MODES,
  STROKES,
  colorModeFromPalette,
  colorModeLabel,
  createQuote,
  deleteQuote,
  estimateQuote,
  formatCoverage,
  listQuotes,
  quoteStatusLabel,
  sizeFromPlacements,
  type TattooSize,
  updateQuote,
  type ColorMode,
  type Estimate,
  type EstimateItem,
  type Quote,
  type QuoteItemInput,
  type Stroke,
} from '../lib/quotes'
import { listSketches, type Sketch } from '../lib/sketches'
import { useAppShellHeader } from '../lib/useAppShellHeader'
import './Studio.css'
import './Cotizaciones.css'

/* ---------------- Estado del formulario ---------------- */

interface FormValue {
  title: string
  projectId: string
  sketchId: string
  widthCm: string
  heightCm: string
  /** En porcentaje, que es como lo lee una persona. */
  coverage: string
  stroke: Stroke
  colorMode: ColorMode
  sessionsCount: string
}

const EMPTY_FORM: FormValue = {
  title: '',
  projectId: '',
  sketchId: '',
  widthCm: '',
  heightCm: '',
  coverage: '',
  stroke: 'medio',
  colorMode: 'negro',
  sessionsCount: '',
}

const positive = (text: string) => {
  const n = Number(String(text).replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Las líneas calculadas y las añadidas a mano comparten esta forma en la UI. */
interface DraftItem extends QuoteItemInput {
  subtotal: number
}

const toDraft = (item: EstimateItem): DraftItem => ({
  materialId: item.materialId,
  name: item.name,
  unit: item.unit,
  quantity: item.quantity,
  unitCost: item.unitCost,
  source: item.source,
  subtotal: item.subtotal,
})

/* ---------------- Página ---------------- */

/**
 * Cotizaciones automatizadas (HU14–HU16).
 *
 * El cálculo siempre lo hace el backend: la página manda los parámetros y
 * dibuja lo que vuelve. Es a propósito — el costo que se le enseña a un
 * cliente no puede depender de lo que calcule un navegador, y las tasas de
 * consumo viven junto al inventario.
 *
 * El flujo tiene dos tiempos, que es como trabaja el artista: primero se
 * estima (HU14) y se ajusta el detalle a mano (HU15), y solo entonces se
 * guarda. El descuento de stock llega después, al cerrar la sesión (HU16).
 */
export default function Cotizaciones() {
  const [params, setParams] = useSearchParams()

  const [quotes, setQuotes] = useState<Quote[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [sketches, setSketches] = useState<Sketch[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [notice, setNotice] = useState('')

  const [form, setForm] = useState<FormValue>(EMPTY_FORM)
  const [estimate, setEstimate] = useState<Estimate | null>(null)
  const [items, setItems] = useState<DraftItem[]>([])
  const [estimating, setEstimating] = useState(false)
  const [estimateError, setEstimateError] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [extraId, setExtraId] = useState('')

  useAppShellHeader({
    title: 'Cotizaciones',
    subtitle: `${quotes.length} ${quotes.length === 1 ? 'cotización' : 'cotizaciones'}`,
  })

  /* ---------- Tamaño desde la escena 3D ---------- */

  /**
   * Rellena el tamaño con el que la calca está puesta sobre el modelo 3D.
   *
   * El visor normaliza cada modelo a su alto humano real, así que ese tamaño ya
   * está en metros de piel: es la medida que el artista probó sobre el cuerpo,
   * no una estimación. Si no hay escena o el boceto no está colocado en ella,
   * los campos quedan para escribirlos a mano.
   *
   * Se dispara al elegir proyecto o boceto, no desde un efecto: traer la medida
   * es la consecuencia de esa elección, no un estado que haya que mantener
   * sincronizado. Solo escribe si los campos están vacíos, para no pisar una
   * medida que el artista ya corrigió.
   */
  const applyPreviewSize = useCallback(async (project: Project, sketchId: string) => {
    // El proyecto ya trae la medida si alguna vez se guardó su escena 3D: es
    // la misma cifra, sin una petición de más. La escena solo se consulta
    // cuando el proyecto todavía no la tiene copiada (escenas guardadas antes
    // de que el proyecto empezara a almacenarla).
    let size: TattooSize | null =
      project.width_cm && project.height_cm
        ? { widthCm: project.width_cm, heightCm: project.height_cm }
        : null

    if (!size && project.preview_id) {
      try {
        const preview = await getPreview(project.preview_id)
        size = sizeFromPlacements(preview.placements, sketchId)
      } catch {
        // La escena es una ayuda, no un requisito: si falla se escribe a mano.
      }
    }
    if (!size) return

    // Solo escribe si los campos están vacíos: una medida que el artista ya
    // corrigió a mano manda sobre la del 3D.
    setForm((f) =>
      f.widthCm || f.heightCm
        ? f
        : { ...f, widthCm: String(size.widthCm), heightCm: String(size.heightCm) },
    )
    setNotice(`Tamaño tomado de la escena 3D: ${size.widthCm} × ${size.heightCm} cm.`)
  }, [])

  /** Elegir proyecto o boceto puede traer el tamaño desde la escena 3D. */
  function pickProject(projectId: string) {
    setForm((f) => ({ ...f, projectId }))
    const project = projects.find((p) => p.id === projectId)
    // Con la medida ya copiada en el proyecto no hace falta boceto para
    // traerla; solo el camino de respaldo (leer la escena) lo necesita.
    if (project) void applyPreviewSize(project, form.sketchId || project.sketch_id || '')
  }

  function pickSketch(sketchId: string) {
    // El modo de color se deduce de lo que se midió en el dibujo, para que el
    // desplegable no contradiga al boceto. Queda editable: es una sugerencia.
    const elegido = sketches.find((s) => s.id === sketchId)
    const modo = colorModeFromPalette(elegido?.palette ?? null)
    setForm((f) => ({ ...f, sketchId, colorMode: modo ?? f.colorMode }))

    const project = projects.find((p) => p.id === form.projectId)
    if (project && sketchId) void applyPreviewSize(project, sketchId)
  }

  /* ---------- Carga inicial ---------- */

  // `?proyecto=<id>` llega desde el botón "Cotizar" de la página de proyecto.
  const projectParam = params.get('proyecto')

  useEffect(() => {
    let cancelled = false
    Promise.all([listQuotes(), listProjects(), listSketches(), listMaterials()])
      .then(([q, p, s, m]) => {
        if (cancelled) return
        setQuotes(q)
        setProjects(p)
        setSketches(s)
        setMaterials(m)
        setLoadError('')

        // La precarga se resuelve aquí y no en un efecto aparte: es parte de
        // la misma carga, y un efecto que observa `projects` para escribir en
        // `form` encadena un render de más cada vez que algo cambia.
        const project = p.find((item) => item.id === projectParam)
        if (project) {
          const modo = colorModeFromPalette(
            s.find((item) => item.id === project.sketch_id)?.palette ?? null,
          )
          setForm((f) => ({
            ...f,
            title: f.title || project.title,
            projectId: project.id,
            sketchId: f.sketchId || project.sketch_id || '',
            colorMode: modo ?? f.colorMode,
          }))
          void applyPreviewSize(project, project.sketch_id ?? '')
        }
      })
      .catch((err) => {
        if (!cancelled) setLoadError(apiErrorMessage(err, 'No pudimos cargar las cotizaciones.'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // `projectParam` solo cambia al navegar desde otro proyecto, y entonces sí
    // corresponde volver a cargar y precargar el formulario.
  }, [projectParam, applyPreviewSize])

  const consumables = useMemo(() => materials.filter(isConsumable), [materials])

  /* ---------- Cálculo (HU14) ---------- */

  const width = positive(form.widthCm)
  const height = positive(form.heightCm)
  const canEstimate = width !== null && height !== null

  // El boceto manda su cobertura medida; si no la tiene (se subió antes de
  // esta iteración) el backend usa la suya y aquí se muestra cuál usó.
  const sketch = sketches.find((s) => s.id === form.sketchId)
  const coverage = positive(form.coverage)

  // Cada tecleo dispara un cálculo, así que se espera a que el artista pare.
  const debounce = useRef<number | undefined>(undefined)

  useEffect(() => {
    // Sin medidas no hay nada que calcular. La estimación anterior no se borra
    // desde aquí: se descarta al pintar (`shownEstimate`), que evita un render
    // encadenado por cada tecla mientras se escribe el ancho.
    if (!canEstimate) return

    window.clearTimeout(debounce.current)
    debounce.current = window.setTimeout(() => {
      setEstimating(true)
      estimateQuote({
        widthCm: width,
        heightCm: height,
        inkRatio: coverage !== null ? Math.min(1, coverage / 100) : undefined,
        stroke: form.stroke,
        colorMode: form.colorMode,
        sessionsCount: positive(form.sessionsCount) ?? undefined,
        sketchId: form.sketchId || undefined,
      })
        .then(({ estimate: result }) => {
          setEstimate(result)
          // Las líneas se reemplazan por las recién calculadas: el artista
          // vuelve a ajustar sobre la base nueva (HU15).
          setItems(result.items.map(toDraft))
          setEstimateError('')
        })
        .catch((err) => setEstimateError(apiErrorMessage(err, 'No pudimos calcular la cotización.')))
        .finally(() => setEstimating(false))
    }, 350)

    return () => window.clearTimeout(debounce.current)
  }, [
    canEstimate,
    width,
    height,
    coverage,
    form.stroke,
    form.colorMode,
    form.sessionsCount,
    form.sketchId,
  ])

  /** Lo que se muestra: una estimación vieja no vale sin medidas válidas. */
  const shownEstimate = canEstimate ? estimate : null

  /* ---------- Ajustes del detalle (HU15) ---------- */

  const total = useMemo(() => items.reduce((sum, i) => sum + i.subtotal, 0), [items])

  function setQuantity(index: number, raw: string) {
    const quantity = Number(String(raw).replace(',', '.'))
    setItems((list) =>
      list.map((item, i) =>
        i === index
          ? {
              ...item,
              quantity,
              subtotal: Math.round((Number.isFinite(quantity) ? quantity : 0) * item.unitCost),
              // Tocarla a mano la marca como ajustada: deja de ser lo que
              // sugirió el algoritmo y pasa a ser decisión del artista.
              source: 'manual',
            }
          : item,
      ),
    )
  }

  const removeItem = (index: number) => setItems((list) => list.filter((_, i) => i !== index))

  function addMaterial(id: string) {
    setExtraId('')
    const material = materials.find((m) => m.id === id)
    if (!material || items.some((i) => i.materialId === id)) return

    setItems((list) => [
      ...list,
      {
        materialId: material.id,
        name: material.name,
        unit: material.unit,
        quantity: 1,
        unitCost: material.unit_cost,
        source: 'manual',
        subtotal: material.unit_cost,
      },
    ])
  }

  const restoreCalculated = () => shownEstimate && setItems(shownEstimate.items.map(toDraft))

  /* ---------- Guardar ---------- */

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) return setFormError('Ponle un título a la cotización.')
    if (!canEstimate) return setFormError('Indica el ancho y el alto del tatuaje.')
    if (!items.length) return setFormError('La cotización necesita al menos un insumo.')

    const invalid = items.find((i) => !Number.isFinite(i.quantity) || i.quantity <= 0)
    if (invalid) return setFormError(`Revisa la cantidad de "${invalid.name}".`)

    setSaving(true)
    setFormError('')
    try {
      const created = await createQuote({
        title: form.title.trim(),
        projectId: form.projectId || null,
        sketchId: form.sketchId || null,
        widthCm: width,
        heightCm: height,
        inkRatio: shownEstimate?.inkRatio,
        stroke: form.stroke,
        colorMode: form.colorMode,
        sessionsCount: positive(form.sessionsCount) ?? shownEstimate?.sessionsCount,
        estimatedMinutes: shownEstimate?.estimatedMinutes,
        // `subtotal` es solo para pintar; el costo lo recalcula el servidor.
        items: items.map((item) => ({
          materialId: item.materialId,
          name: item.name,
          unit: item.unit,
          quantity: item.quantity,
          unitCost: item.unitCost,
          source: item.source,
        })),
      })
      setQuotes((list) => [created, ...list])
      setForm(EMPTY_FORM)
      setEstimate(null)
      setItems([])
      setNotice(`Cotización "${created.title}" guardada.`)
      if (projectParam) setParams({}, { replace: true })
    } catch (err) {
      setFormError(apiErrorMessage(err, 'No pudimos guardar la cotización.'))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(quote: Quote) {
    if (!window.confirm(`¿Eliminar la cotización "${quote.title}"?`)) return
    try {
      await deleteQuote(quote.id)
      setQuotes((list) => list.filter((q) => q.id !== quote.id))
      setNotice('Cotización eliminada.')
    } catch (err) {
      setNotice(apiErrorMessage(err, 'No pudimos eliminar la cotización.'))
    }
  }

  async function handleAccept(quote: Quote) {
    try {
      const updated = await updateQuote(quote.id, { status: 'aceptada' })
      setQuotes((list) => list.map((q) => (q.id === updated.id ? updated : q)))
    } catch (err) {
      setNotice(apiErrorMessage(err, 'No pudimos actualizar la cotización.'))
    }
  }

  /* ---------- Vista ---------- */

  return (
    <div className="studio">
      <div className="st-body">
        {notice && (
          <p className="st-notice" role="status" onClick={() => setNotice('')}>
            {notice}
          </p>
        )}

        <div className="st-cols">
          {/* ---- Calculadora (HU14) ---- */}
          <section className="st-panel">
            <div className="st-panel__head">
              <h2 className="st-title">Nueva cotización</h2>
            </div>

            {consumables.length === 0 ? (
              <p className="st-empty">
                Todavía no hay insumos con regla de consumo. Para cotizar,{' '}
                <Link className="st-link" to="/inventario">
                  indica en el inventario
                </Link>{' '}
                cómo se gasta cada insumo (por tamaño, por sesión o por hora).
              </p>
            ) : (
              <form className="st-stack" onSubmit={handleSubmit}>
                <div className="st-field">
                  <label className="st-label" htmlFor="q-title">Título</label>
                  <input
                    id="q-title"
                    className="st-input"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    placeholder="Rosa en antebrazo"
                    autoComplete="off"
                  />
                </div>

                <div className="st-row">
                  <div className="st-field">
                    <label className="st-label" htmlFor="q-project">Proyecto</label>
                    <select
                      id="q-project"
                      className="st-input"
                      value={form.projectId}
                      onChange={(e) => pickProject(e.target.value)}
                    >
                      <option value="">Sin proyecto</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.title} — {p.client_name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="st-field">
                    <label className="st-label" htmlFor="q-sketch">Boceto</label>
                    <select
                      id="q-sketch"
                      className="st-input"
                      value={form.sketchId}
                      onChange={(e) => pickSketch(e.target.value)}
                    >
                      <option value="">Sin boceto</option>
                      {sketches.map((s) => (
                        <option key={s.id} value={s.id}>{s.title}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="st-row">
                  <div className="st-field">
                    <label className="st-label" htmlFor="q-width">Ancho (cm)</label>
                    <input
                      id="q-width"
                      className="st-input"
                      type="number"
                      min={0.1}
                      step="any"
                      inputMode="decimal"
                      value={form.widthCm}
                      onChange={(e) => setForm({ ...form, widthCm: e.target.value })}
                      placeholder="15"
                    />
                  </div>
                  <div className="st-field">
                    <label className="st-label" htmlFor="q-height">Alto (cm)</label>
                    <input
                      id="q-height"
                      className="st-input"
                      type="number"
                      min={0.1}
                      step="any"
                      inputMode="decimal"
                      value={form.heightCm}
                      onChange={(e) => setForm({ ...form, heightCm: e.target.value })}
                      placeholder="15"
                    />
                  </div>
                </div>

                <div className="st-row">
                  <div className="st-field">
                    <label className="st-label" htmlFor="q-stroke">Trazo</label>
                    <select
                      id="q-stroke"
                      className="st-input"
                      value={form.stroke}
                      onChange={(e) => setForm({ ...form, stroke: e.target.value as Stroke })}
                    >
                      {STROKES.map((s) => (
                        <option key={s.value} value={s.value}>{s.label} — {s.hint}</option>
                      ))}
                    </select>
                  </div>
                  <div className="st-field">
                    <label className="st-label" htmlFor="q-color">Color</label>
                    <select
                      id="q-color"
                      className="st-input"
                      value={form.colorMode}
                      onChange={(e) => setForm({ ...form, colorMode: e.target.value as ColorMode })}
                    >
                      {COLOR_MODES.map((c) => (
                        <option key={c.value} value={c.value}>{c.label} — {c.hint}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="st-row">
                  <div className="st-field">
                    <label className="st-label" htmlFor="q-sessions">Sesiones</label>
                    <input
                      id="q-sessions"
                      className="st-input"
                      type="number"
                      min={1}
                      step={1}
                      inputMode="numeric"
                      value={form.sessionsCount}
                      onChange={(e) => setForm({ ...form, sessionsCount: e.target.value })}
                    />
                  </div>
                  <div className="st-field">
                    <label className="st-label" htmlFor="q-coverage">Cobertura de tinta</label>
                    <input
                      id="q-coverage"
                      className="st-input"
                      type="number"
                      min={1}
                      max={100}
                      step={1}
                      inputMode="numeric"
                      value={form.coverage}
                      onChange={(e) => setForm({ ...form, coverage: e.target.value })}
                      placeholder={
                        shownEstimate
                        ? String(Math.round(shownEstimate.inkRatio * 100))
                        : 'automática'
                      }
                    />
                  </div>
                </div>

                <p className="st-hint">
                  {sketch?.ink_ratio
                    ? `Medida en "${sketch.title}": ${formatCoverage(Number(sketch.ink_ratio))} del
                       lienzo tiene tinta. Puedes corregirla si el diseño cambió.`
                    : 'Cuánto del rectángulo lleva tinta de verdad. Si eliges un boceto se mide solo; ' +
                      'si no, déjala vacía para usar un valor estándar.'}
                </p>

                <p className="st-hint">
                La cotización es del <strong>tatuaje completo</strong>. Las sesiones salen del
                trabajo que pide la pieza y solo cambian lo que se monta en cada cita (guantes,
                film, transfer): repartirla en más citas no la agranda. Indícalas solo si ya las
                acordaste con el cliente.
              </p>

              {estimateError && <p className="st-empty st-empty--error">{estimateError}</p>}
                {formError && <p className="st-empty st-empty--error">{formError}</p>}

                <button
                  className="st-btn st-btn--primary st-btn--block"
                  type="submit"
                  disabled={saving || !shownEstimate}
                >
                  {saving ? 'Guardando…' : 'Guardar cotización'}
                </button>
              </form>
            )}
          </section>

          {/* ---- Resultado y ajuste del detalle (HU14 + HU15) ---- */}
          <section className="st-panel">
            <div className="st-panel__head">
              <h2 className="st-title">Detalle de insumos</h2>
              {estimating && <span className="st-count">calculando…</span>}
            </div>

            {!shownEstimate ? (
              <p className="st-empty">
                Indica el ancho y el alto del tatuaje y el costo de los insumos aparece aquí.
              </p>
            ) : (
              <>
                <div className="qt-summary">
                  <div className="qt-summary__cell">
                    <span className="qt-summary__label">Área a tatuar</span>
                    <strong className="qt-summary__value">{shownEstimate.effectiveArea} cm²</strong>
                    <span className="st-hint">
                      de {shownEstimate.boundingArea} cm² · {formatCoverage(shownEstimate.inkRatio)} con tinta
                    </span>
                  </div>
                  <div className="qt-summary__cell">
                    <span className="qt-summary__label">Tiempo estimado</span>
                    <strong className="qt-summary__value">
                      {formatDuration(shownEstimate.estimatedMinutes)}
                    </strong>
                    <span className="st-hint">
                      {shownEstimate.sessionsCount === 1
                        ? `${formatDuration(shownEstimate.workMinutes)} de aguja en 1 sesión, más la preparación`
                        : `${formatDuration(shownEstimate.workMinutes)} de aguja repartidas en ${shownEstimate.sessionsCount} sesiones, más la preparación de cada una`}
                    </span>
                  </div>
                  <div className="qt-summary__cell qt-summary__cell--total">
                    <span className="qt-summary__label">Costo de insumos</span>
                    <strong className="qt-summary__value">{formatCLP(total)}</strong>
                    <span className="st-hint">no incluye tu trabajo</span>
                  </div>
                </div>

                {/* Paleta del boceto (HU14): qué tintas lleva el diseño y en qué
                  proporción. Es lo que explica por qué cada tinta recibe los
                  mililitros que recibe. */}
              {sketch?.palette?.length ? (
                <div className="qt-palette">
                  <span className="qt-palette__label">Colores del boceto</span>
                  <ul className="qt-swatches">
                    {sketch.palette.map((color) => (
                      <li className="qt-swatch" key={color.hex}>
                        <span
                          className="qt-swatch__dot"
                          style={{ background: color.hex }}
                          aria-hidden="true"
                        />
                        {Math.round(color.share * 100)}%
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                // Sin paleta medida, el reparto sale del modo de color elegido
                // a mano. Funciona, pero conviene decir que hay un camino
                // exacto: elegir el boceto y dejar que se midan sus colores.
                <p className="st-hint qt-palette-hint">
                  Tintas repartidas según «{colorModeLabel(form.colorMode).toLowerCase()}».
                  {' '}Elige un boceto para repartirlas por los colores que tiene de verdad.
                </p>
              )}

              {shownEstimate.missingInks?.length ? (
                <p className="st-warn qt-missing">
                  <strong>Tintas por comprar.</strong> El diseño lleva{' '}
                  {shownEstimate.missingInks.map((ink, index) => (
                    <span key={ink.hex}>
                      {index > 0 && ', '}
                      <span
                        className="qt-swatch__dot"
                        style={{ background: ink.hex }}
                        aria-hidden="true"
                      />
                      {ink.suggestion ?? ink.hex} ({Math.round(ink.share * 100)}%)
                    </span>
                  ))}{' '}
                  y no hay ninguna tinta parecida en tu inventario. Se cotizaron a precio de
                  referencia; agrégalas al inventario para usar tu precio y descontar stock.
                </p>
              ) : null}

              <ul className="qt-items">
                  {items.map((item, index) => (
                    <li className="qt-item" key={`${item.materialId}-${index}`}>
                      <div className="qt-item__main">
                        <span className="qt-item__name">{item.name}</span>
                        <span className="st-hint">
                          {formatCLP(item.unitCost)} por {item.unit}
                          {item.source === 'manual' && ' · ajustado'}
                        </span>
                      </div>
                      <input
                        className="st-input st-input--sm qt-item__qty"
                        type="number"
                        min={0}
                        step="any"
                        inputMode="decimal"
                        aria-label={`Cantidad de ${item.name}`}
                        value={item.quantity}
                        onChange={(e) => setQuantity(index, e.target.value)}
                      />
                      <span className="qt-item__unit">{item.unit}</span>
                      <span className="qt-item__sub">{formatCLP(item.subtotal)}</span>
                      <button
                        className="st-btn st-btn--sm st-btn--danger"
                        type="button"
                        onClick={() => removeItem(index)}
                        aria-label={`Quitar ${item.name}`}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>

                {/* HU15: agregar o quitar materiales sobre lo que sugirió el algoritmo. */}
                <div className="st-row st-actions--tight">
                  <select
                    className="st-input st-input--sm"
                    value={extraId}
                    onChange={(e) => addMaterial(e.target.value)}
                    aria-label="Agregar un insumo a la cotización"
                  >
                    <option value="">Agregar un insumo…</option>
                    {materials
                      .filter((m) => !items.some((i) => i.materialId === m.id))
                      .map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                  </select>
                  <button
                    className="st-btn st-btn--sm"
                    type="button"
                    onClick={restoreCalculated}
                    disabled={!shownEstimate}
                  >
                    Restaurar sugerencia
                  </button>
                </div>
              </>
            )}
          </section>
        </div>

        {/* ---- Cotizaciones guardadas ---- */}
        <section className="st-panel">
          <div className="st-panel__head">
            <h2 className="st-title">Guardadas</h2>
            <span className="st-count">{quotes.length}</span>
          </div>

          {loading ? (
            <p className="st-empty">Cargando…</p>
          ) : loadError ? (
            <p className="st-empty st-empty--error">{loadError}</p>
          ) : quotes.length === 0 ? (
            <p className="st-empty">Todavía no guardas ninguna cotización.</p>
          ) : (
            <ul className="st-list">
              {quotes.map((quote) => (
                <li className="st-item" key={quote.id}>
                  <div className="st-item__main">
                    <span className="st-item__title">{quote.title}</span>
                    <span className="st-item__meta">
                      {quote.width_cm} × {quote.height_cm} cm ·{' '}
                      {formatDuration(quote.estimated_minutes)} ·{' '}
                      {quote.sessions_count === 1
                        ? '1 sesión'
                        : `${quote.sessions_count} sesiones`}
                      {quote.project_title && ` · ${quote.project_title}`}
                      {quote.client_name && ` (${quote.client_name})`}
                    </span>
                  </div>
                  <div className="st-item__side">
                    <span className="st-money">{formatCLP(quote.materials_cost)}</span>
                    <span
                      className={`st-badge st-badge--${
                        quote.status === 'aceptada' ? 'completada' : 'agendada'
                      }`}
                    >
                      {quote.consumed_at ? 'Stock descontado' : quoteStatusLabel(quote.status)}
                    </span>
                    <div className="st-actions st-actions--tight">
                      {quote.status === 'borrador' && !quote.consumed_at && (
                        <button
                          className="st-btn st-btn--sm"
                          type="button"
                          onClick={() => handleAccept(quote)}
                        >
                          Aceptar
                        </button>
                      )}
                      <button
                        className="st-btn st-btn--sm st-btn--danger"
                        type="button"
                        onClick={() => handleDelete(quote)}
                      >
                        Eliminar
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
