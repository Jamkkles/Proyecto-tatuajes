import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ApiError } from '../lib/api'
import { resetPassword } from '../lib/auth'
import AuthStage from '../components/AuthStage'
import './Login.css'

export default function ResetPassword() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<{ password?: string; confirm?: string }>({})
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [formError, setFormError] = useState('')

  function validate(): boolean {
    const next: { password?: string; confirm?: string } = {}
    if (!password) next.password = 'Ingresa la nueva contraseña.'
    else if (password.length < 8) next.password = 'Mínimo 8 caracteres.'
    if (!confirm) next.confirm = 'Confirma la contraseña.'
    else if (password !== confirm) next.confirm = 'Las contraseñas no coinciden.'
    setFieldErrors(next)
    return Object.keys(next).length === 0
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setFormError('')
    if (!validate()) return

    setLoading(true)
    try {
      await resetPassword(token, password)
      setSuccess(true)
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Algo salió mal. Inténtalo de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <div className="auth">
        <AuthStage />
        <main className="auth__panel">
          <section className="card">
            <p className="card__eyebrow">Enlace inválido</p>
            <h1 className="card__title" style={{ fontSize: 'clamp(28px,6vw,36px)' }}>
              Este enlace no es <span className="card__title-em">válido</span>
            </h1>
            <p className="card__sub">
              El enlace de recuperación falta o está malformado. Solicita uno nuevo.
            </p>
            <p className="card__foot">
              <Link to="/recuperar">Solicitar nuevo enlace</Link>
            </p>
          </section>
        </main>
      </div>
    )
  }

  return (
    <div className="auth">
      <AuthStage />

      <main className="auth__panel">
        <section className="card" aria-labelledby="reset-title">
          <p className="card__eyebrow">Nueva contraseña</p>
          <h1 className="card__title" id="reset-title">
            Elige una contraseña <span className="card__title-em">segura</span>
          </h1>

          {success ? (
            <>
              <p className="card__success" role="status">
                Contraseña actualizada. Ya puedes iniciar sesión.
              </p>
              <p className="card__foot">
                <Link to="/">Ir al inicio de sesión</Link>
              </p>
            </>
          ) : (
            <form className="form" onSubmit={handleSubmit} noValidate>
              {formError && (
                <p className="form__alert" role="alert">{formError}</p>
              )}

              <div className="field">
                <div className="field__row">
                  <label className="field__label" htmlFor="password">Nueva contraseña</label>
                  <button
                    type="button"
                    className="field__toggle"
                    onClick={() => setShowPassword((v) => !v)}
                    tabIndex={-1}
                  >
                    {showPassword ? 'Ocultar' : 'Mostrar'}
                  </button>
                </div>
                <input
                  id="password"
                  className="field__input"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Mínimo 8 caracteres"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  aria-invalid={Boolean(fieldErrors.password)}
                  aria-describedby={fieldErrors.password ? 'pw-error' : undefined}
                />
                {fieldErrors.password && (
                  <span className="field__error" id="pw-error">{fieldErrors.password}</span>
                )}
              </div>

              <div className="field">
                <label className="field__label" htmlFor="confirm">Confirmar contraseña</label>
                <input
                  id="confirm"
                  className="field__input"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Repite la contraseña"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  disabled={loading}
                  aria-invalid={Boolean(fieldErrors.confirm)}
                  aria-describedby={fieldErrors.confirm ? 'confirm-error' : undefined}
                />
                {fieldErrors.confirm && (
                  <span className="field__error" id="confirm-error">{fieldErrors.confirm}</span>
                )}
              </div>

              <button className="btn" type="submit" disabled={loading}>
                <span className="btn__label">{loading ? 'Guardando…' : 'Guardar contraseña'}</span>
              </button>

              <p className="card__foot" style={{ marginTop: '12px', paddingTop: '0', border: 'none' }}>
                <Link to="/">Cancelar</Link>
              </p>
            </form>
          )}
        </section>
      </main>
    </div>
  )
}
