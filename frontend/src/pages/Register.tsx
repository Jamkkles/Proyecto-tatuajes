import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ApiError } from '../lib/api'
import { register, saveToken, saveUser } from '../lib/auth'
import AuthStage from '../components/AuthStage'
import './Login.css'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function Register() {
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string; email?: string; password?: string; confirm?: string
  }>({})
  const [formError, setFormError] = useState('')
  const [loading, setLoading] = useState(false)

  function validate(): boolean {
    const next: typeof fieldErrors = {}
    if (!name.trim()) next.name = 'Ingresa tu nombre.'
    if (!email.trim()) next.email = 'Ingresa tu correo.'
    else if (!EMAIL_RE.test(email.trim())) next.email = 'Ese correo no parece válido.'
    if (!password) next.password = 'Ingresa una contraseña.'
    else if (password.length < 8) next.password = 'Mínimo 8 caracteres.'
    if (!confirm) next.confirm = 'Confirma tu contraseña.'
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
      const { token, user } = await register({ name: name.trim(), email: email.trim(), password })
      saveToken(token)
      saveUser(user)
      navigate('/dashboard')
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : 'Algo salió mal. Inténtalo de nuevo.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth">
      <AuthStage />

      <main className="auth__panel">
        <section className="card" aria-labelledby="register-title">
          <p className="card__eyebrow">Crear cuenta</p>
          <h1 className="card__title" id="register-title">
            Registra tu <span className="card__title-em">estudio</span>
          </h1>
          <p className="card__sub">
            Crea tu cuenta para empezar a gestionar bocetos, citas y cotizaciones.
          </p>

          <form className="form" onSubmit={handleSubmit} noValidate>
            {formError && (
              <p className="form__alert" role="alert">{formError}</p>
            )}

            <div className="field">
              <label className="field__label" htmlFor="name">Nombre</label>
              <input
                id="name"
                className="field__input"
                type="text"
                autoComplete="name"
                placeholder="Tu nombre completo"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={loading}
                aria-invalid={Boolean(fieldErrors.name)}
                aria-describedby={fieldErrors.name ? 'name-error' : undefined}
              />
              {fieldErrors.name && (
                <span className="field__error" id="name-error">{fieldErrors.name}</span>
              )}
            </div>

            <div className="field">
              <label className="field__label" htmlFor="email">Correo</label>
              <input
                id="email"
                className="field__input"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="tu@correo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                aria-invalid={Boolean(fieldErrors.email)}
                aria-describedby={fieldErrors.email ? 'email-error' : undefined}
              />
              {fieldErrors.email && (
                <span className="field__error" id="email-error">{fieldErrors.email}</span>
              )}
            </div>

            <div className="field">
              <div className="field__row">
                <label className="field__label" htmlFor="password">Contraseña</label>
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
              <span className="btn__label">{loading ? 'Creando cuenta…' : 'Crear cuenta'}</span>
            </button>
          </form>

          <p className="card__foot">
            ¿Ya tienes cuenta? <Link to="/">Iniciar sesión</Link>
          </p>
        </section>
      </main>
    </div>
  )
}
