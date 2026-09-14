import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { buildMonthGrid, daysInMonth, isoLocal, isSameDay } from '../lib/dates'
import './MonthCalendar.css'

/**
 * Calendario del mes (panel y agenda). Recibe un mapa de conteos de citas por
 * día; avisa el mes visible con `onMonthChange` para que la página cargue esas
 * citas, y el día elegido con `onSelectDay`.
 *
 * Depende de que la página que lo monte cargue `Dashboard.css` (reutiliza el
 * chrome de `.panelbox`) y viva dentro de `.dash` (token `--accent`).
 */

const WEEKDAYS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'] as const

const monthFmt = new Intl.DateTimeFormat('es-CL', { month: 'long', year: 'numeric' })
const fullFmt = new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })

const countLabel = (count: number) =>
  count === 0 ? 'sin citas' : count === 1 ? '1 cita' : `${count} citas`

/* ---------- Iconos (mismos paths que el carrusel del panel) ---------- */
const chevronLeft = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)
const chevronRight = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export interface MonthCalendarProps {
  /** Nº de citas por día. Clave: fecha local 'YYYY-MM-DD'. */
  appointmentsByDay?: Record<string, number>
  /** Día seleccionado inicial (ISO local). Por defecto: hoy. */
  initialSelected?: string
  /** Se llama al seleccionar un día (ISO local). */
  onSelectDay?: (isoDate: string) => void
  /**
   * Se llama con el mes visible (0 = enero) al montar y cada vez que cambia,
   * para que la página cargue las citas de ese mes.
   */
  onMonthChange?: (year: number, month: number) => void
  /**
   * Contenido de la vista previa al pasar el mouse (o con foco) sobre un día.
   * Devolver null para no mostrar nada ese día.
   */
  renderDayPreview?: (isoDate: string) => ReactNode
}

/** Ancho máximo de la vista previa (px); coincide con .mcal-tip en el CSS. */
const TIP_WIDTH = 260

const ARROW_DELTA: Record<string, number> = {
  ArrowRight: 1,
  ArrowLeft: -1,
  ArrowDown: 7,
  ArrowUp: -7,
}

export default function MonthCalendar({
  appointmentsByDay,
  initialSelected,
  onSelectDay,
  onMonthChange,
  renderDayPreview,
}: MonthCalendarProps) {
  // Estable durante la vida del componente. Si el panel queda abierto pasada la
  // medianoche, "hoy" queda algo desfasado — aceptable para v1.
  const [todayDate] = useState(() => new Date())
  // Arranca en el mes del día seleccionado (por defecto, el de hoy).
  const [view, setView] = useState(() => {
    const base = initialSelected ? new Date(`${initialSelected}T00:00:00`) : todayDate
    return { year: base.getFullYear(), month: base.getMonth() }
  })
  const [selected, setSelected] = useState(() => initialSelected ?? isoLocal(todayDate))
  const [focusIso, setFocusIso] = useState<string | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)

  // El callback se lee de un ref: así una función nueva en cada render del
  // padre no vuelve a disparar la carga del mes.
  const onMonthChangeRef = useRef(onMonthChange)
  useEffect(() => {
    onMonthChangeRef.current = onMonthChange
  })
  useEffect(() => {
    onMonthChangeRef.current?.(view.year, view.month)
  }, [view.year, view.month])

  // Vista previa del día. Va en un portal con position: fixed: .panelbox
  // recorta con overflow y su backdrop-filter atraparía un fixed interior.
  const tipId = useId()
  const [preview, setPreview] = useState<{ iso: string; x: number; y: number; below: boolean } | null>(null)
  const previewContent = preview && renderDayPreview ? renderDayPreview(preview.iso) : null

  function showPreview(iso: string, el: HTMLElement) {
    if (!renderDayPreview) return
    const r = el.getBoundingClientRect()
    const half = TIP_WIDTH / 2 + 8
    const x = Math.min(Math.max(r.left + r.width / 2, half), window.innerWidth - half)
    // Encima del día; si queda muy arriba en la pantalla, debajo.
    const below = r.top < 180
    setPreview({ iso, x, y: below ? r.bottom + 8 : r.top - 8, below })
  }
  const hidePreview = () => setPreview(null)

  // Al hacer scroll la posición guardada deja de valer: se cierra.
  const previewOpen = preview !== null
  useEffect(() => {
    if (!previewOpen) return
    const close = () => setPreview(null)
    window.addEventListener('scroll', close, { passive: true, capture: true })
    return () => window.removeEventListener('scroll', close, { capture: true })
  }, [previewOpen])

  useEffect(() => {
    if (!focusIso) return
    gridRef.current
      ?.querySelector<HTMLButtonElement>(`[data-iso="${focusIso}"]`)
      ?.focus()
  }, [focusIso])

  const grid = buildMonthGrid(view.year, view.month)
  const monthLabel = monthFmt.format(new Date(view.year, view.month, 1))

  function goMonth(delta: number) {
    setView((v) => {
      const d = new Date(v.year, v.month + delta, 1)
      return { year: d.getFullYear(), month: d.getMonth() }
    })
  }

  function pickDay(iso: string) {
    setSelected(iso)
    setFocusIso(iso)
    onSelectDay?.(iso)
  }

  function onGridKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const cur = new Date(`${selected}T00:00:00`)
    let next: Date | null = null
    if (e.key in ARROW_DELTA) {
      next = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + ARROW_DELTA[e.key])
    } else if (e.key === 'Home') {
      next = new Date(view.year, view.month, 1)
    } else if (e.key === 'End') {
      next = new Date(view.year, view.month, daysInMonth(view.year, view.month))
    }
    if (!next) return
    e.preventDefault()
    const iso = isoLocal(next)
    setSelected(iso)
    setFocusIso(iso)
    if (next.getMonth() !== view.month || next.getFullYear() !== view.year) {
      setView({ year: next.getFullYear(), month: next.getMonth() })
    }
  }

  // Roving tabindex: un único día alcanzable con Tab.
  const selectedVisible = grid.some(
    (d) => d.getMonth() === view.month && isoLocal(d) === selected,
  )
  const tabbableIso = selectedVisible
    ? selected
    : isoLocal(new Date(view.year, view.month, 1))

  return (
    <section className="panelbox mcal" aria-labelledby="mcal-h">
      <div className="panelbox__head">
        <h3 className="panelbox__title" id="mcal-h">Calendario del mes</h3>
        <div className="mcal__nav">
          <button
            type="button"
            className="mcal__navbtn"
            onClick={() => goMonth(-1)}
            aria-label="Mes anterior"
          >
            {chevronLeft}
          </button>
          <button
            type="button"
            className="mcal__navbtn"
            onClick={() => goMonth(1)}
            aria-label="Mes siguiente"
          >
            {chevronRight}
          </button>
        </div>
      </div>

      <div className="mcal__body">
        <p className="mcal__month" aria-live="polite">{monthLabel}</p>

        <div className="mcal__grid mcal__weekrow" aria-hidden="true">
          {WEEKDAYS.map((w) => (
            <span key={w} className="mcal__wd">{w}</span>
          ))}
        </div>

        <div
          className="mcal__grid"
          role="grid"
          aria-label={`Días de ${monthLabel}`}
          ref={gridRef}
          onKeyDown={onGridKeyDown}
        >
          {grid.map((d) => {
            const iso = isoLocal(d)
            const outside = d.getMonth() !== view.month
            const isToday = isSameDay(d, todayDate)
            const isSelected = iso === selected
            const count = appointmentsByDay?.[iso] ?? 0
            const cls = [
              'mcal__day',
              outside && 'is-outside',
              isToday && 'is-today',
              isSelected && 'is-selected',
              count > 0 && 'has-appts',
            ]
              .filter(Boolean)
              .join(' ')
            return (
              <button
                key={iso}
                type="button"
                data-iso={iso}
                className={cls}
                role="gridcell"
                aria-current={isToday ? 'date' : undefined}
                aria-pressed={isSelected}
                aria-label={`${fullFmt.format(d)}, ${countLabel(count)}`}
                tabIndex={iso === tabbableIso ? 0 : -1}
                aria-describedby={preview?.iso === iso && previewContent ? tipId : undefined}
                onClick={() => pickDay(iso)}
                onMouseEnter={(e) => showPreview(iso, e.currentTarget)}
                onMouseLeave={hidePreview}
                onFocus={(e) => showPreview(iso, e.currentTarget)}
                onBlur={hidePreview}
              >
                <span className="mcal__daynum">{d.getDate()}</span>
                {count > 0 && (
                  <span className="mcal__dot" aria-hidden="true">{count}</span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {preview &&
        previewContent &&
        createPortal(
          <div
            id={tipId}
            role="tooltip"
            className={`mcal-tip${preview.below ? ' mcal-tip--below' : ''}`}
            style={{ left: preview.x, top: preview.y }}
          >
            {previewContent}
          </div>,
          document.body,
        )}
    </section>
  )
}
