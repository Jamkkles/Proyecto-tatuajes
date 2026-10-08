import { useEffect, useMemo, useState } from 'react'
import { MoneyInput } from '../components/AgendaFields'
import { apiErrorMessage } from '../lib/api'
import {
  CONSUMPTION_BASES,
  MATERIAL_CATEGORIES,
  MATERIAL_PRESETS,
  MATERIAL_UNITS,
  adjustStock,
  basisPer,
  categoryLabel,
  createMaterial,
  deleteAllMaterials,
  deleteMaterial,
  isLowStock,
  listMaterials,
  loadDefaultMaterials,
  stockValue,
  unitShort,
  updateMaterial,
  type ConsumptionBasis,
  type Material,
  type MaterialCategory,
  type MaterialInput,
  type MaterialUnit,
} from '../lib/materials'
import { formatAmountInput, formatCLP, parseCLP } from '../lib/money'
import { useAppShellHeader } from '../lib/useAppShellHeader'
import './Studio.css'

/* ---------------- Formulario ---------------- */

interface MaterialFormValue {
  name: string
  category: MaterialCategory
  unit: MaterialUnit
  quantity: string
  minQuantity: string
  cost: string
  basis: ConsumptionBasis
  rate: string
  /** Color de la tinta; '' cuando el insumo no es una tinta. */
  colorHex: string
  supplier: string
  notes: string
}

const EMPTY_FORM: MaterialFormValue = {
  name: '',
  category: 'agujas',
  unit: 'unidad',
  quantity: '',
  minQuantity: '',
  cost: '',
  basis: 'ninguno',
  rate: '',
  colorHex: '',
  supplier: '',
  notes: '',
}

const materialToForm = (m: Material): MaterialFormValue => ({
  name: m.name,
  category: m.category,
  unit: m.unit,
  quantity: String(m.quantity),
  minQuantity: String(m.min_quantity),
  cost: formatAmountInput(m.unit_cost),
  basis: m.consumption_basis,
  rate: m.consumption_rate ? String(m.consumption_rate) : '',
  colorHex: m.color_hex ?? '',
  supplier: m.supplier ?? '',
  notes: m.notes ?? '',
})

const formToInput = (v: MaterialFormValue): MaterialInput => ({
  name: v.name.trim(),
  category: v.category,
  unit: v.unit,
  quantity: Math.max(0, Math.trunc(Number(v.quantity) || 0)),
  minQuantity: Math.max(0, Math.trunc(Number(v.minQuantity) || 0)),
  unitCost: parseCLP(v.cost),
  consumptionBasis: v.basis,
  // Un insumo que no se consume no lleva tasa: así no queda un número suelto
  // si el artista cambia de opinión después de haberla escrito.
  consumptionRate: v.basis === 'ninguno' ? 0 : Math.max(0, Number(v.rate) || 0),
  // El color solo se guarda en las tintas: en el resto no significa nada y
  // dejarlo puesto haría que un insumo entrara al reparto de color por error.
  colorHex: v.category === 'tintas' ? v.colorHex || null : null,
  supplier: v.supplier.trim() || null,
  notes: v.notes.trim() || null,
})

interface MaterialFieldsProps {
  idPrefix: string
  value: MaterialFormValue
  onChange: (value: MaterialFormValue) => void
}

/** Campos de un insumo, compartidos por el alta y la edición. */
function MaterialFields({ idPrefix, value, onChange }: MaterialFieldsProps) {
  return (
    <>
      <div className="st-field">
        <label className="st-label" htmlFor={`${idPrefix}-name`}>Insumo</label>
        <input
          id={`${idPrefix}-name`}
          className="st-input"
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          placeholder="Cartuchos round liner 03"
          autoComplete="off"
        />
      </div>

      <div className="st-row">
        <div className="st-field">
          <label className="st-label" htmlFor={`${idPrefix}-cat`}>Categoría</label>
          <select
            id={`${idPrefix}-cat`}
            className="st-input"
            value={value.category}
            onChange={(e) => onChange({ ...value, category: e.target.value as MaterialCategory })}
          >
            {MATERIAL_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
        <div className="st-field">
          <label className="st-label" htmlFor={`${idPrefix}-unit`}>Se cuenta en</label>
          <select
            id={`${idPrefix}-unit`}
            className="st-input"
            value={value.unit}
            onChange={(e) => onChange({ ...value, unit: e.target.value as MaterialUnit })}
          >
            {MATERIAL_UNITS.map((u) => (
              <option key={u.value} value={u.value}>{u.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="st-row">
        <div className="st-field">
          <label className="st-label" htmlFor={`${idPrefix}-qty`}>Stock actual</label>
          <input
            id={`${idPrefix}-qty`}
            className="st-input"
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            value={value.quantity}
            onChange={(e) => onChange({ ...value, quantity: e.target.value })}
            placeholder="0"
          />
        </div>
        <div className="st-field">
          <label className="st-label" htmlFor={`${idPrefix}-min`}>Nivel crítico</label>
          <input
            id={`${idPrefix}-min`}
            className="st-input"
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            value={value.minQuantity}
            onChange={(e) => onChange({ ...value, minQuantity: e.target.value })}
            placeholder="0"
          />
        </div>
      </div>

      <div className="st-row">
        <div className="st-field">
          <label className="st-label" htmlFor={`${idPrefix}-cost`}>
            Costo por {unitShort(value.unit, 1)}
          </label>
          <MoneyInput
            id={`${idPrefix}-cost`}
            value={value.cost}
            onChange={(cost) => onChange({ ...value, cost })}
          />
        </div>
        <div className="st-field">
          <label className="st-label" htmlFor={`${idPrefix}-sup`}>Proveedor</label>
          <input
            id={`${idPrefix}-sup`}
            className="st-input"
            value={value.supplier}
            onChange={(e) => onChange({ ...value, supplier: e.target.value })}
            placeholder="Distribuidora…"
            autoComplete="off"
          />
        </div>
      </div>

      {/*
        Regla de consumo (HU14): lo que conecta este insumo con el cotizador.
        Un insumo sin regla no aparece en las cotizaciones, y eso está bien
        para la máquina o el pedal.
      */}
      <div className="st-row">
        <div className="st-field">
          <label className="st-label" htmlFor={`${idPrefix}-basis`}>Se gasta</label>
          <select
            id={`${idPrefix}-basis`}
            className="st-input"
            value={value.basis}
            onChange={(e) =>
              onChange({ ...value, basis: e.target.value as ConsumptionBasis })
            }
          >
            {CONSUMPTION_BASES.map((b) => (
              <option key={b.value} value={b.value}>{b.label}</option>
            ))}
          </select>
        </div>
        {value.basis !== 'ninguno' && (
          <div className="st-field">
            <label className="st-label" htmlFor={`${idPrefix}-rate`}>
              Cuánto {basisPer(value.basis)}
            </label>
            <input
              id={`${idPrefix}-rate`}
              className="st-input"
              type="number"
              min={0}
              step="any"
              inputMode="decimal"
              value={value.rate}
              onChange={(e) => onChange({ ...value, rate: e.target.value })}
              placeholder="0"
            />
          </div>
        )}
      </div>
      {/*
        Color de la tinta (HU14). Es lo que permite repartir los mililitros
        entre las tintas que el diseño realmente lleva, en vez de cobrar todas
        por el área completa. Solo aparece en las tintas: en un guante o un
        rollo de film el color no significa nada.
      */}
      {value.category === 'tintas' && (
        <div className="st-field">
          <label className="st-label" htmlFor={`${idPrefix}-color`}>Color de la tinta</label>
          <div className="st-row st-actions--tight">
            <input
              id={`${idPrefix}-color`}
              type="color"
              className="st-input mat-color"
              value={value.colorHex || '#111111'}
              onChange={(e) => onChange({ ...value, colorHex: e.target.value })}
            />
            {value.colorHex && (
              <button
                className="st-btn st-btn--sm"
                type="button"
                onClick={() => onChange({ ...value, colorHex: '' })}
              >
                Quitar color
              </button>
            )}
          </div>
          <p className="st-hint">
            {value.colorHex
              ? 'Se usa para repartir la tinta según los colores del boceto.'
              : 'Sin color, esta tinta se cotiza por el área completa del diseño.'}
          </p>
        </div>
      )}

      {value.basis !== 'ninguno' && (
        <p className="st-hint">
          {unitShort(value.unit, Number(value.rate) === 1 ? 1 : 2)} de este insumo{' '}
          {basisPer(value.basis)}. Se usa para calcular las cotizaciones.
        </p>
      )}

      <div className="st-field">
        <label className="st-label" htmlFor={`${idPrefix}-notes`}>Notas</label>
        <textarea
          id={`${idPrefix}-notes`}
          className="st-input"
          rows={2}
          value={value.notes}
          onChange={(e) => onChange({ ...value, notes: e.target.value })}
          placeholder="Marca, calibre, dónde se compra…"
        />
      </div>
    </>
  )
}

/* ---------------- Vista ---------------- */

type CategoryFilter = MaterialCategory | 'todas'

/**
 * Inventario (HU11–HU13): registrar insumos con su stock y costo, ajustarlos o
 * eliminarlos, y avisar cuando alguno llega a su nivel crítico.
 *
 * El filtrado y el resumen se hacen en memoria: el inventario de un estudio son
 * decenas de insumos, así responde al instante y las cuentas de arriba siempre
 * reflejan todo el inventario, no solo lo filtrado.
 */
export default function Inventario() {
  const [materials, setMaterials] = useState<Material[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [notice, setNotice] = useState('')

  const [category, setCategory] = useState<CategoryFilter>('todas')
  const [onlyLow, setOnlyLow] = useState(false)
  const [query, setQuery] = useState('')

  const [form, setForm] = useState(EMPTY_FORM)
  const [preset, setPreset] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  // Qué hace el kit básico en este momento: cargarlo o vaciar el inventario.
  const [kitBusy, setKitBusy] = useState<'load' | 'clear' | null>(null)

  useAppShellHeader({
    title: 'Inventario',
    subtitle: `${materials.length} ${materials.length === 1 ? 'insumo' : 'insumos'}`,
  })

  useEffect(() => {
    let cancelled = false
    listMaterials()
      .then((list) => {
        if (cancelled) return
        setMaterials(list)
        setLoadError('')
      })
      .catch((err) => {
        if (!cancelled) setLoadError(apiErrorMessage(err, 'No pudimos cargar el inventario.'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const lowStock = useMemo(() => materials.filter(isLowStock), [materials])
  const totalValue = useMemo(() => materials.reduce((sum, m) => sum + stockValue(m), 0), [materials])

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase()
    return materials.filter((m) => {
      if (category !== 'todas' && m.category !== category) return false
      if (onlyLow && !isLowStock(m)) return false
      if (term && !`${m.name} ${m.supplier ?? ''}`.toLowerCase().includes(term)) return false
      return true
    })
  }, [materials, category, onlyLow, query])

  /** Ordena igual que el backend: primero lo que hay que reponer. */
  const sortMaterials = (list: Material[]) =>
    [...list].sort(
      (a, b) =>
        Number(isLowStock(b)) - Number(isLowStock(a)) ||
        a.name.localeCompare(b.name, 'es'),
    )

  const replaceMaterial = (updated: Material) =>
    setMaterials((list) => sortMaterials(list.map((m) => (m.id === updated.id ? updated : m))))

  function applyPreset(name: string) {
    setPreset(name)
    const found = MATERIAL_PRESETS.find((p) => p.name === name)
    if (!found) return
    // Solo sugiere el insumo: la cantidad la pone el artista. La regla de
    // consumo y el precio sí vienen sugeridos, porque son lo que casi nadie
    // rellenaría de memoria: sin regla el insumo no entra en las cotizaciones,
    // y el precio referencial evita el error más común, cargar lo que cuesta
    // el envase en vez de lo que cuesta la unidad.
    setForm((f) => ({
      ...f,
      name: found.name,
      category: found.category,
      unit: found.unit,
      minQuantity: String(found.minQuantity),
      basis: found.basis,
      rate: found.rate ? String(found.rate) : '',
      colorHex: found.colorHex ?? '',
      cost: formatAmountInput(found.unitCost),
    }))
  }

  /** Agrega el kit básico. Lo que ya está en el inventario no se toca. */
  async function loadKit() {
    setKitBusy('load')
    setNotice('')
    try {
      const created = await loadDefaultMaterials()
      if (created.length === 0) {
        setNotice('Ya tienes todos los insumos del kit básico.')
        return
      }
      setMaterials((list) => sortMaterials([...list, ...created]))
      setNotice(
        `Se cargaron ${created.length} ${created.length === 1 ? 'insumo' : 'insumos'} del kit básico. ` +
          'El stock es de ejemplo: ajústalo a lo que de verdad tienes.',
      )
    } catch (err) {
      setNotice(apiErrorMessage(err, 'No pudimos cargar el kit básico.'))
    } finally {
      setKitBusy(null)
    }
  }

  /** Vacía el inventario, para quien prefiere armarlo a su manera. */
  async function clearAll() {
    const count = materials.length
    if (count === 0) return
    const ok = window.confirm(
      `¿Eliminar los ${count} insumos del inventario?\n\n` +
        'Esto no se puede deshacer. Las cotizaciones guardadas conservan sus líneas, ' +
        'pero dejan de descontar stock. Después puedes volver a cargar el kit básico.',
    )
    if (!ok) return

    setKitBusy('clear')
    setNotice('')
    try {
      await deleteAllMaterials()
      setMaterials([])
      setCategory('todas')
      setOnlyLow(false)
      setQuery('')
      setNotice('Inventario vacío. Agrega tus insumos a tu manera.')
    } catch (err) {
      setNotice(apiErrorMessage(err, 'No pudimos vaciar el inventario.'))
    } finally {
      setKitBusy(null)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return setFormError('Ponle un nombre al insumo.')

    setSaving(true)
    setFormError('')
    try {
      const created = await createMaterial(formToInput(form))
      setMaterials((list) => sortMaterials([...list, created]))
      setForm(EMPTY_FORM)
      setPreset('')
      setNotice(`«${created.name}» agregado al inventario.`)
    } catch (err) {
      setFormError(apiErrorMessage(err, 'No pudimos guardar el insumo.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="studio">
      <div className="st-body">
        {/* Aviso de nivel crítico (HU13) */}
        {lowStock.length > 0 && (
          <p className="st-warn" role="status">
            <strong>
              {lowStock.length === 1
                ? '1 insumo llegó a su nivel crítico'
                : `${lowStock.length} insumos llegaron a su nivel crítico`}
              :
            </strong>{' '}
            {lowStock.slice(0, 3).map((m) => m.name).join(', ')}
            {lowStock.length > 3 ? ` y ${lowStock.length - 3} más` : ''}.{' '}
            {!onlyLow && (
              <button type="button" className="st-link" onClick={() => setOnlyLow(true)}>
                Ver solo esos
              </button>
            )}
          </p>
        )}

        <div className="st-cols">
          {/* ---------- Alta ---------- */}
          <section className="st-panel" aria-labelledby="mat-new-h">
            <h2 className="st-h" id="mat-new-h">Nuevo insumo</h2>

            <div className="st-field">
              <label className="st-label" htmlFor="mat-preset">Insumos frecuentes</label>
              <select
                id="mat-preset"
                className="st-input"
                value={preset}
                onChange={(e) => applyPreset(e.target.value)}
              >
                <option value="">Elegir de la lista…</option>
                {MATERIAL_CATEGORIES.map((c) => (
                  <optgroup key={c.value} label={c.label}>
                    {MATERIAL_PRESETS.filter((p) => p.category === c.value).map((p) => (
                      <option key={p.name} value={p.name}>{p.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <p className="st-hint">
                Rellena nombre, categoría y unidad; tú pones el stock y el costo.
              </p>
            </div>

            <form onSubmit={handleSubmit} noValidate>
              <MaterialFields idPrefix="mat" value={form} onChange={setForm} />
              {formError && <p className="st-alert" role="alert">{formError}</p>}
              <div className="st-actions">
                <button className="st-btn st-btn--primary" type="submit" disabled={saving}>
                  {saving ? 'Guardando…' : 'Agregar al inventario'}
                </button>
              </div>
            </form>
          </section>

          <div className="st-stack">
            {/* ---------- Resumen ---------- */}
            <section className="st-panel" aria-labelledby="mat-sum-h">
              <h2 className="st-h" id="mat-sum-h">Resumen</h2>
              <dl className="st-money">
                <div>
                  <dt>Insumos</dt>
                  <dd>{materials.length}</dd>
                </div>
                <div>
                  <dt>Nivel crítico</dt>
                  <dd className={lowStock.length ? 'is-due' : undefined}>{lowStock.length}</dd>
                </div>
                <div>
                  <dt>Valor del stock</dt>
                  <dd>{formatCLP(totalValue)}</dd>
                </div>
              </dl>
              <p className="st-hint">
                El costo por unidad es la base del cálculo de cotizaciones.
              </p>
            </section>

            {/* ---------- Lista ---------- */}
            <section className="st-panel" aria-labelledby="mat-list-h">
              <div className="st-panel__head">
                <h2 className="st-h" id="mat-list-h">
                  Mis insumos <span className="st-count">{visible.length}</span>
                </h2>
                <input
                  className="st-input st-input--search"
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar insumo o proveedor…"
                  aria-label="Buscar insumos"
                />
              </div>

              <div className="st-kit">
                <button
                  type="button"
                  className="st-btn st-btn--sm"
                  onClick={loadKit}
                  disabled={loading || kitBusy !== null}
                >
                  {kitBusy === 'load' ? 'Cargando…' : 'Cargar insumos básicos'}
                </button>
                <button
                  type="button"
                  className="st-btn st-btn--sm st-btn--danger"
                  onClick={clearAll}
                  disabled={loading || kitBusy !== null || materials.length === 0}
                >
                  {kitBusy === 'clear' ? 'Eliminando…' : 'Eliminar todos'}
                </button>
              </div>

              <div className="st-chips" role="group" aria-label="Filtrar por categoría">
                <button
                  type="button"
                  className={`st-chip${category === 'todas' ? ' st-chip--on' : ''}`}
                  aria-pressed={category === 'todas'}
                  onClick={() => setCategory('todas')}
                >
                  Todas
                </button>
                {MATERIAL_CATEGORIES.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    className={`st-chip${category === c.value ? ' st-chip--on' : ''}`}
                    aria-pressed={category === c.value}
                    onClick={() => setCategory(c.value)}
                  >
                    {c.label}
                  </button>
                ))}
                <button
                  type="button"
                  className={`st-chip st-chip--alert${onlyLow ? ' st-chip--on' : ''}`}
                  aria-pressed={onlyLow}
                  onClick={() => setOnlyLow((v) => !v)}
                >
                  Solo nivel crítico
                </button>
              </div>

              {notice && (
                <p className="st-notice" role="status" onAnimationEnd={() => setNotice('')}>
                  {notice}
                </p>
              )}

              {loading ? (
                <p className="st-empty">Cargando inventario…</p>
              ) : loadError ? (
                <p className="st-empty st-empty--error" role="alert">{loadError}</p>
              ) : visible.length === 0 ? (
                <p className="st-empty">
                  {materials.length === 0
                    ? 'Tu inventario está vacío. Carga el kit básico o agrega tus insumos con la lista de insumos frecuentes.'
                    : 'Ningún insumo coincide con el filtro.'}
                </p>
              ) : (
                <ul className="st-mats">
                  {visible.map((m) => (
                    <MaterialCard
                      key={m.id}
                      material={m}
                      onChanged={replaceMaterial}
                      onRemoved={(id) => setMaterials((list) => list.filter((x) => x.id !== id))}
                      onNotice={setNotice}
                    />
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ============================================================
   Tarjeta de insumo: stock, ajuste rápido, edición y borrado
   ============================================================ */

interface MaterialCardProps {
  material: Material
  onChanged: (material: Material) => void
  onRemoved: (id: string) => void
  onNotice: (message: string) => void
}

function MaterialCard({ material, onChanged, onRemoved, onNotice }: MaterialCardProps) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<MaterialFormValue>(() => materialToForm(material))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const low = isLowStock(material)

  /** Ajuste rápido: descontar lo usado en una sesión o sumar una compra. */
  async function step(delta: number) {
    setBusy(true)
    setError('')
    try {
      onChanged(await adjustStock(material.id, delta))
    } catch (err) {
      setError(apiErrorMessage(err, 'No pudimos ajustar el stock.'))
    } finally {
      setBusy(false)
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return setError('El nombre no puede quedar vacío.')

    setBusy(true)
    setError('')
    try {
      onChanged(await updateMaterial(material.id, formToInput(form)))
      setEditing(false)
      onNotice('Insumo actualizado.')
    } catch (err) {
      setError(apiErrorMessage(err, 'No pudimos guardar los cambios.'))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!window.confirm(`¿Eliminar «${material.name}» del inventario?`)) return
    try {
      await deleteMaterial(material.id)
      onRemoved(material.id)
      onNotice('Insumo eliminado.')
    } catch (err) {
      setError(apiErrorMessage(err, 'No pudimos eliminar el insumo.'))
    }
  }

  function toggleEdit() {
    setForm(materialToForm(material))
    setEditing((v) => !v)
    setError('')
  }

  return (
    <li className={`st-mat${low ? ' st-mat--low' : ''}`}>
      <div className="st-mat__row">
        <div className="st-mat__main">
          <p className="st-mat__name">{material.name}</p>
          <p className="st-mat__meta">
            {categoryLabel(material.category)} · {formatCLP(material.unit_cost)} por{' '}
            {unitShort(material.unit, 1)}
            {material.supplier ? ` · ${material.supplier}` : ''}
          </p>
        </div>

        <div className="st-mat__stock">
          <p className="st-mat__qty">
            {material.quantity} <span>{unitShort(material.unit, material.quantity)}</span>
          </p>
          {low ? (
            <span className="st-badge st-badge--low">
              {material.quantity === 0 ? 'Sin stock' : 'Nivel crítico'}
            </span>
          ) : (
            <span className="st-mat__min">mín. {material.min_quantity}</span>
          )}
        </div>

        <div className="st-mat__adjust">
          <button
            type="button"
            className="st-qty"
            onClick={() => step(-1)}
            disabled={busy || material.quantity === 0}
            aria-label={`Descontar 1 a ${material.name}`}
          >
            −
          </button>
          <button
            type="button"
            className="st-qty"
            onClick={() => step(1)}
            disabled={busy}
            aria-label={`Sumar 1 a ${material.name}`}
          >
            +
          </button>
        </div>
      </div>

      {material.notes && !editing && <p className="st-mat__notes">{material.notes}</p>}

      {editing && (
        <form className="st-session__form" onSubmit={save} noValidate>
          <MaterialFields idPrefix={`ed-${material.id}`} value={form} onChange={setForm} />
          <div className="st-actions st-actions--tight">
            <button className="st-btn st-btn--primary st-btn--sm" type="submit" disabled={busy}>
              {busy ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      )}

      {error && <p className="st-alert" role="alert">{error}</p>}

      <div className="st-mat__actions">
        <button type="button" className="st-btn st-btn--sm" onClick={toggleEdit}>
          {editing ? 'Cancelar' : 'Editar'}
        </button>
        <button type="button" className="st-btn st-btn--sm st-btn--danger" onClick={remove}>
          Eliminar
        </button>
      </div>
    </li>
  )
}
