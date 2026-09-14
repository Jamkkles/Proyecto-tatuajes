import { DURATION_OPTIONS, formatAmountInput, formatDuration, parseCLP } from '../lib/agenda'
import type { ClientFormValue, SessionFormValue } from '../lib/agendaForms'

/**
 * Campos de formulario compartidos por las vistas de la agenda (Citas,
 * Clientes, Cliente, Proyecto). Usan las clases `st-*` de `pages/Studio.css`,
 * que carga cada una de esas páginas.
 */

interface MoneyInputProps {
  id: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

/** Monto en pesos: se reformatea mientras se escribe ("150000" → "150.000"). */
export function MoneyInput({ id, value, onChange, placeholder = '0' }: MoneyInputProps) {
  return (
    <div className="st-money-input">
      <span aria-hidden="true">$</span>
      <input
        id={id}
        className="st-input"
        inputMode="numeric"
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(formatAmountInput(parseCLP(e.target.value)))}
      />
    </div>
  )
}

interface ClientFieldsProps {
  idPrefix: string
  value: ClientFormValue
  onChange: (value: ClientFormValue) => void
}

export function ClientFields({ idPrefix, value, onChange }: ClientFieldsProps) {
  const set =
    (key: keyof ClientFormValue) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange({ ...value, [key]: e.target.value })

  return (
    <>
      <div className="st-field">
        <label className="st-label" htmlFor={`${idPrefix}-name`}>Nombre</label>
        <input
          id={`${idPrefix}-name`}
          className="st-input"
          value={value.name}
          onChange={set('name')}
          placeholder="Camila Rojas"
          autoComplete="off"
          required
        />
      </div>

      <div className="st-row">
        <div className="st-field">
          <label className="st-label" htmlFor={`${idPrefix}-phone`}>Teléfono</label>
          <input
            id={`${idPrefix}-phone`}
            className="st-input"
            type="tel"
            value={value.phone}
            onChange={set('phone')}
            placeholder="+56 9 1234 5678"
          />
        </div>
        <div className="st-field">
          <label className="st-label" htmlFor={`${idPrefix}-ig`}>Instagram</label>
          <input
            id={`${idPrefix}-ig`}
            className="st-input"
            value={value.instagram}
            onChange={set('instagram')}
            placeholder="@usuario"
            autoComplete="off"
          />
        </div>
      </div>

      <div className="st-field">
        <label className="st-label" htmlFor={`${idPrefix}-email`}>Correo</label>
        <input
          id={`${idPrefix}-email`}
          className="st-input"
          type="email"
          value={value.email}
          onChange={set('email')}
          placeholder="camila@correo.cl"
        />
      </div>

      <div className="st-field">
        <label className="st-label" htmlFor={`${idPrefix}-notes`}>Notas</label>
        <textarea
          id={`${idPrefix}-notes`}
          className="st-input"
          rows={2}
          value={value.notes}
          onChange={set('notes')}
          placeholder="Alergias, piel sensible, preferencias…"
        />
      </div>
    </>
  )
}

interface SessionFieldsProps {
  idPrefix: string
  value: SessionFormValue
  onChange: (value: SessionFormValue) => void
}

/** Fecha, hora, duración, cobro y notas de una sesión (cita). */
export function SessionFields({ idPrefix, value, onChange }: SessionFieldsProps) {
  // Una duración guardada que no está en la lista (p. ej. 150) igual se muestra.
  const durations = DURATION_OPTIONS.includes(value.duration)
    ? DURATION_OPTIONS
    : [...DURATION_OPTIONS, value.duration].sort((a, b) => a - b)

  return (
    <>
      <div className="st-row">
        <div className="st-field">
          <label className="st-label" htmlFor={`${idPrefix}-date`}>Fecha</label>
          <input
            id={`${idPrefix}-date`}
            className="st-input"
            type="date"
            value={value.date}
            onChange={(e) => onChange({ ...value, date: e.target.value })}
            required
          />
        </div>
        <div className="st-field">
          <label className="st-label" htmlFor={`${idPrefix}-time`}>Hora</label>
          <input
            id={`${idPrefix}-time`}
            className="st-input"
            type="time"
            step={900}
            value={value.time}
            onChange={(e) => onChange({ ...value, time: e.target.value })}
            required
          />
        </div>
      </div>

      <div className="st-row">
        <div className="st-field">
          <label className="st-label" htmlFor={`${idPrefix}-dur`}>Duración</label>
          <select
            id={`${idPrefix}-dur`}
            className="st-input"
            value={value.duration}
            onChange={(e) => onChange({ ...value, duration: Number(e.target.value) })}
          >
            {durations.map((m) => (
              <option key={m} value={m}>{formatDuration(m)}</option>
            ))}
          </select>
        </div>
        <div className="st-field">
          <label className="st-label" htmlFor={`${idPrefix}-price`}>Cobro de la sesión</label>
          <MoneyInput
            id={`${idPrefix}-price`}
            value={value.price}
            onChange={(price) => onChange({ ...value, price })}
          />
        </div>
      </div>

      <div className="st-field">
        <label className="st-label" htmlFor={`${idPrefix}-notes`}>Notas</label>
        <textarea
          id={`${idPrefix}-notes`}
          className="st-input"
          rows={2}
          value={value.notes}
          onChange={(e) => onChange({ ...value, notes: e.target.value })}
          placeholder="Línea, sombra, retoque…"
        />
      </div>
    </>
  )
}
