import { useState, type FormEvent } from 'react'
import { ApiError } from '../lib/api'
import { login, saveToken } from '../lib/auth'
import './Login.css'

type Status = 'idle' | 'loading' | 'success'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [status, setStatus] = useState<Status>('idle')
  const [formError, setFormError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({})

  function validate(): boolean {
    const next: { email?: string; password?: string } = {}
    if (!email.trim()) next.email = 'Ingresa tu correo.'
    else if (!EMAIL_RE.test(email.trim())) next.email = 'Ese correo no parece válido.'
    if (!password) next.password = 'Ingresa tu contraseña.'
    setFieldErrors(next)
    return Object.keys(next).length === 0
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError('')
    if (!validate()) return

    setStatus('loading')
    try {
      const { token } = await login({ email: email.trim(), password })
      saveToken(token)
      setStatus('success')
      // TODO: redirigir al panel del estudio cuando exista el enrutado.
    } catch (err) {
      setStatus('idle')
      if (err instanceof ApiError) {
        setFormError(
          err.status === 401
            ? 'Correo o contraseña incorrectos.'
            : err.message,
        )
      } else {
        setFormError('Algo salió mal. Inténtalo de nuevo.')
      }
    }
  }

  const loading = status === 'loading'

  return (
    <div className="auth">
      <Stage />

      <main className="auth__panel">
        <section className="card" aria-labelledby="auth-title">
          <p className="card__eyebrow">Panel del artista</p>
          <h1 className="card__title" id="auth-title">
            Bienvenido <span className="card__title-em">de vuelta</span>
          </h1>
          <p className="card__sub">
            Entra a tu estudio para gestionar bocetos, citas y cotizaciones.
          </p>

          {status === 'success' ? (
            <p className="card__success" role="status">
              Sesión iniciada. Abriendo tu estudio…
            </p>
          ) : (
            <form className="form" onSubmit={handleSubmit} noValidate>
              {formError && (
                <p className="form__alert" role="alert">
                  {formError}
                </p>
              )}

              <div className="field">
                <label className="field__label" htmlFor="email">
                  Correo
                </label>
                <input
                  id="email"
                  className="field__input"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="hola@hectortattoos.cl"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  aria-invalid={Boolean(fieldErrors.email)}
                  aria-describedby={fieldErrors.email ? 'email-error' : undefined}
                />
                {fieldErrors.email && (
                  <span className="field__error" id="email-error">
                    {fieldErrors.email}
                  </span>
                )}
              </div>

              <div className="field">
                <div className="field__row">
                  <label className="field__label" htmlFor="password">
                    Contraseña
                  </label>
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
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  aria-invalid={Boolean(fieldErrors.password)}
                  aria-describedby={fieldErrors.password ? 'password-error' : undefined}
                />
                {fieldErrors.password && (
                  <span className="field__error" id="password-error">
                    {fieldErrors.password}
                  </span>
                )}
              </div>

              <a className="form__forgot" href="#recuperar">
                ¿Olvidaste tu contraseña?
              </a>

              <button className="btn" type="submit" disabled={loading}>
                <span className="btn__label">{loading ? 'Entrando…' : 'Entrar'}</span>
              </button>
            </form>
          )}

          <p className="card__foot">
            ¿Aún no tienes estudio? <a href="#crear">Crear cuenta</a>
          </p>
        </section>

       
      </main>
    </div>
  )
}

/** Atmósfera: humo japonés + watermark del monograma. Puramente decorativa. */
function Stage() {
  return (
    <div className="stage" aria-hidden="true">
      <img className="stage__photo" src="/espalda.png" alt="" />
      <svg
        className="stage__smoke"
        viewBox="0 0 600 900"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
      >
        <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5">
          <path d="M-40 210 C 120 150, 200 300, 140 410 S 60 620, 220 690 S 420 700, 360 540" />
          <path d="M10 120 C 180 90, 250 250, 180 360 S 90 560, 250 650 S 470 660, 410 470" />
          <path d="M-60 330 C 110 280, 180 420, 110 520 S 30 700, 200 770" />
          <path d="M80 40 C 240 30, 320 190, 250 300 S 150 500, 320 590 S 540 600, 470 400" />
          <path d="M-20 470 C 140 440, 210 560, 150 650 S 70 820, 240 880" />
        </g>
      </svg>

      <div className="stage__copy">
   
        <p className="stage__tagline">Todo tu estudio, en un solo trazo.</p>
      </div>
    </div>
  )
}
