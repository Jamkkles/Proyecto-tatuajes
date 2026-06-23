import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '../lib/api'
import { forgotPassword } from '../lib/auth'
import AuthStage from '../components/AuthStage'
import './Login.css'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [formError, setFormError] = useState('')

  function validate(): boolean {
    if (!email.trim()) { setEmailError('Ingresa tu correo.'); return false }
    if (!EMAIL_RE.test(email.trim())) { setEmailError('Ese correo no parece válido.'); return false }
    setEmailError('')
    return true
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setFormError('')
    if (!validate()) return

    setLoading(true)
    try {
      await forgotPassword(email.trim())
      setSent(true)
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Algo salió mal. Inténtalo de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth">
      <AuthStage />

      <main className="auth__panel">
        <section className="card" aria-labelledby="forgot-title">
          <p className="card__eyebrow">Recuperar acceso</p>
          <h1 className="card__title" id="forgot-title">
            ¿Olvidaste tu <span className="card__title-em">contraseña?</span>
          </h1>

          {sent ? (
            <>
              <p className="card__sub">
                Si ese correo está registrado, recibirás un enlace en los próximos minutos.
                Revisa también tu carpeta de spam.
              </p>
              <Link className="form__forgot" style={{ alignSelf: 'flex-start' }} to="/">
                Volver al inicio de sesión
              </Link>
            </>
          ) : (
            <>
              <p className="card__sub">
                Ingresa tu correo y te enviaremos un enlace para restablecer tu contraseña.
              </p>

              <form className="form" onSubmit={handleSubmit} noValidate>
                {formError && (
                  <p className="form__alert" role="alert">{formError}</p>
                )}

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
                    aria-invalid={Boolean(emailError)}
                    aria-describedby={emailError ? 'email-error' : undefined}
                  />
                  {emailError && (
                    <span className="field__error" id="email-error">{emailError}</span>
                  )}
                </div>

                <button className="btn" type="submit" disabled={loading}>
                  <span className="btn__label">{loading ? 'Enviando…' : 'Enviar enlace'}</span>
                </button>
              </form>

              <p className="card__foot">
                <Link to="/">Volver al inicio de sesión</Link>
              </p>
            </>
          )}
        </section>
      </main>
    </div>
  )
}
