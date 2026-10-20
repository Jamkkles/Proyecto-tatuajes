import { useEffect, useState } from 'react'
import { apiErrorMessage } from '../lib/api'
import { startOfMonth } from '../lib/dates'
import { formatCLP } from '../lib/money'
import { getStudioSummary, type StudioSummary } from '../lib/studio'
import { useAppShellHeader } from '../lib/useAppShellHeader'
import './Studio.css'
import './Admin.css'

const monthFmt = new Intl.DateTimeFormat('es-CL', { month: 'long', year: 'numeric' })

/**
 * «Mi estudio»: lo que entró en el mes por cada tatuador del estudio. Solo la ve el dueño
 * (el servidor lo exige) y solo trae números: nadie ve aquí clientes ni datos de trabajo
 * de los demás, ni puede tocar nada.
 */
export default function MiEstudio() {
  const [cursor, setCursor] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })
  const [data, setData] = useState<StudioSummary | null>(null)
  const [error, setError] = useState('')

  useAppShellHeader({ title: 'Mi estudio', subtitle: data?.studio.name ?? 'Lo que entró en el mes' })

  useEffect(() => {
    let cancelled = false
    const from = startOfMonth(cursor.year, cursor.month)
    const to = startOfMonth(cursor.year, cursor.month + 1)
    getStudioSummary(from, to)
      .then((res) => {
        if (cancelled) return
        setData(res)
        setError('')
      })
      .catch((err) => {
        if (!cancelled) setError(apiErrorMessage(err, 'No pudimos cargar el resumen del estudio.'))
      })
    return () => {
      cancelled = true
    }
  }, [cursor])

  const move = (delta: number) =>
    setCursor(({ year, month }) => {
      const d = new Date(year, month + delta, 1)
      return { year: d.getFullYear(), month: d.getMonth() }
    })

  const label = monthFmt.format(new Date(cursor.year, cursor.month, 1))

  return (
    <div className="studio">
      <div className="st-body adm">
        <div className="ms-month">
          <button type="button" className="st-btn st-btn--sm" onClick={() => move(-1)} aria-label="Mes anterior">‹</button>
          <h2 className="ms-month__label">{label}</h2>
          <button type="button" className="st-btn st-btn--sm" onClick={() => move(1)} aria-label="Mes siguiente">›</button>
        </div>

        {error ? (
          <p className="st-empty st-empty--error" role="alert">{error}</p>
        ) : !data ? (
          <p className="st-empty">Cargando…</p>
        ) : (
          <>
            <section className="adm-totals" aria-label="Totales del estudio">
              <div className="adm-tile">
                <span className="adm-tile__value">{formatCLP(data.totals.collected)}</span>
                <span className="adm-tile__label">Cobrado en el estudio</span>
              </div>
              <div className="adm-tile">
                <span className="adm-tile__value">{formatCLP(data.totals.pending)}</span>
                <span className="adm-tile__label">Por cobrar</span>
              </div>
              <div className="adm-tile">
                <span className="adm-tile__value">{data.totals.sessionsDone}</span>
                <span className="adm-tile__label">Sesiones hechas</span>
              </div>
              <div className="adm-tile">
                <span className="adm-tile__value">{data.totals.appointments}</span>
                <span className="adm-tile__label">Citas agendadas</span>
              </div>
            </section>

            <section className="st-panel" aria-labelledby="ms-h">
              <h2 className="st-h" id="ms-h">Por tatuador</h2>
              <ul className="adm-people adm-people--all">
                {data.tattooists.map((t) => (
                  <li key={t.id} className={`adm-person${t.active ? '' : ' is-off'}`}>
                    <span className="adm-person__main">
                      <span className="adm-person__name">
                        {t.name}
                        {t.is_owner && <span className="st-badge">Dueño</span>}
                        {!t.active && <span className="st-badge adm-off">Desactivado</span>}
                      </span>
                      <span className="adm-person__mail">
                        {t.sessions_done} {t.sessions_done === 1 ? 'sesión hecha' : 'sesiones hechas'} ·{' '}
                        {t.appointments} {t.appointments === 1 ? 'cita agendada' : 'citas agendadas'}
                      </span>
                    </span>
                    <span className="ms-money">
                      <span className="ms-money__main">{formatCLP(t.collected)}</span>
                      <span className="ms-money__sub">
                        {t.pending > 0 ? `${formatCLP(t.pending)} por cobrar` : 'nada por cobrar'}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="st-hint">
                «Cobrado» cuenta las sesiones por el día en que se marcaron pagadas; «por cobrar», lo no
                pagado de las citas del mes. Solo tú, como dueño, ves este resumen.
              </p>
            </section>
          </>
        )}
      </div>
    </div>
  )
}
