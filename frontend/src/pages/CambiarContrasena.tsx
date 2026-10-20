import { useNavigate } from 'react-router-dom'
import ChangePasswordForm from '../components/ChangePasswordForm'
import { getUser, isAdmin } from '../lib/auth'
import { useAppShellHeader } from '../lib/useAppShellHeader'
import './Studio.css'

/**
 * Aparece al entrar con una contraseña temporal del administrador: hasta cambiarla, el
 * resto de la app redirige aquí (ver ProtectedRoute).
 */
export default function CambiarContrasena() {
  useAppShellHeader({ title: 'Cambia tu contraseña', subtitle: 'Antes de seguir' })
  const navigate = useNavigate()

  return (
    <div className="studio">
      <div className="st-body">
        <section className="st-panel" aria-labelledby="pw-h" style={{ maxWidth: 520 }}>
          <h2 className="st-h" id="pw-h">Elige una contraseña propia</h2>
          <p className="st-hint" style={{ marginBottom: 18 }}>
            Entraste con una contraseña temporal que te dio el administrador. Cámbiala por una que
            solo sepas tú. Como «contraseña actual», escribe esa temporal.
          </p>
          <ChangePasswordForm
            submitLabel="Guardar y continuar"
            onDone={() => navigate(isAdmin(getUser()) ? '/admin' : '/dashboard', { replace: true })}
          />
        </section>
      </div>
    </div>
  )
}
