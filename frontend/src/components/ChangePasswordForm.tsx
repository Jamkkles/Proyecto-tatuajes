import { useState } from 'react'
import { apiErrorMessage } from '../lib/api'
import { changePassword, getUser, saveUser } from '../lib/auth'

interface ChangePasswordFormProps {
  /** Se llama tras cambiarla bien (la página obligatoria redirige; la de ajustes, no). */
  onDone?: () => void
  submitLabel?: string
}

/**
 * Cambiar la contraseña de la propia cuenta. Lo usan Configuración y la pantalla que
 * aparece al entrar con una contraseña temporal del administrador.
 */
export default function ChangePasswordForm({ onDone, submitLabel = 'Cambiar contraseña' }: ChangePasswordFormProps) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [repeat, setRepeat] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setNotice('')
    if (!current || !next) return setError('Escribe tu contraseña actual y la nueva.')
    if (next.length < 8) return setError('La contraseña nueva debe tener al menos 8 caracteres.')
    if (next !== repeat) return setError('Las dos contraseñas nuevas no coinciden.')

    setSaving(true)
    try {
      await changePassword(current, next)
      // Ya no es temporal: la app deja de pedir el cambio.
      const user = getUser()
      if (user) saveUser({ ...user, mustChangePassword: false })
      setCurrent('')
      setNext('')
      setRepeat('')
      setNotice('Contraseña actualizada.')
      onDone?.()
    } catch (err) {
      setError(apiErrorMessage(err, 'No pudimos cambiar la contraseña.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="st-field">
        <label className="st-label" htmlFor="pw-current">Contraseña actual</label>
        <input
          id="pw-current"
          className="st-input"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
      </div>
      <div className="st-field">
        <label className="st-label" htmlFor="pw-new">Contraseña nueva</label>
        <input
          id="pw-new"
          className="st-input"
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />
      </div>
      <div className="st-field">
        <label className="st-label" htmlFor="pw-repeat">Repite la contraseña nueva</label>
        <input
          id="pw-repeat"
          className="st-input"
          type="password"
          autoComplete="new-password"
          value={repeat}
          onChange={(e) => setRepeat(e.target.value)}
        />
      </div>
      <p className="st-hint">Al menos 8 caracteres. Tu sesión sigue abierta después de cambiarla.</p>
      {error && <p className="st-alert" role="alert">{error}</p>}
      {notice && <p className="st-notice" role="status">{notice}</p>}
      <div className="st-actions">
        <button className="st-btn st-btn--primary" type="submit" disabled={saving}>
          {saving ? 'Guardando…' : submitLabel}
        </button>
      </div>
    </form>
  )
}
