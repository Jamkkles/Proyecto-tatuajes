import './RatingStars.css'
import { RATING_TEXT } from '../lib/ratings'

interface RatingStarsProps {
  /** 1 a 5, o null si aún no tiene puntaje. */
  value: number | null
  /** Con esto las estrellas se pueden pulsar; sin él, es solo una marca. */
  onChange?: (value: number | null) => void
  disabled?: boolean
  /** Nombre accesible del grupo cuando es editable. */
  label?: string
}

const STARS = [1, 2, 3, 4, 5]

/**
 * Estrellas del puntaje de un cliente (HU30). Pulsar la estrella que ya está elegida
 * quita el puntaje.
 */
export default function RatingStars({ value, onChange, disabled = false, label = 'Puntaje' }: RatingStarsProps) {
  if (!onChange) {
    return (
      <span
        className="stars stars--static"
        role="img"
        aria-label={value ? `Puntaje ${value} de 5: ${RATING_TEXT[value]}` : 'Sin puntaje'}
      >
        {STARS.map((n) => (
          <span key={n} className={`stars__star${value !== null && n <= value ? ' is-on' : ''}`} aria-hidden="true">
            ★
          </span>
        ))}
      </span>
    )
  }

  return (
    <span className="stars" role="radiogroup" aria-label={label}>
      {STARS.map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} de 5: ${RATING_TEXT[n]}`}
          title={RATING_TEXT[n]}
          className={`stars__star stars__btn${value !== null && n <= value ? ' is-on' : ''}`}
          disabled={disabled}
          onClick={() => onChange(value === n ? null : n)}
        >
          ★
        </button>
      ))}
    </span>
  )
}
