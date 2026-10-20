import { Navigate, useLocation } from 'react-router-dom'
import { getUser, isAdmin, isAuthenticated } from '../lib/auth'
import type { ReactNode } from 'react'

const CHANGE_PASSWORD = '/cambiar-contrasena'

/**
 * Redirige al login si no hay sesión activa, y a cambiar la contraseña si la cuenta entró
 * con una temporal del administrador (hasta que la cambie, no hay otra pantalla).
 */
export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  if (!isAuthenticated()) {
    return <Navigate to="/" replace />
  }
  if (getUser()?.mustChangePassword && pathname !== CHANGE_PASSWORD) {
    return <Navigate to={CHANGE_PASSWORD} replace />
  }
  return <>{children}</>
}

/**
 * Solo para el administrador. Es comodidad, no seguridad: aunque alguien forzara la
 * pantalla, el servidor responde 403 a cada ruta de /api/admin si la cuenta no lo es.
 */
export function AdminRoute({ children }: { children: ReactNode }) {
  if (!isAdmin(getUser())) {
    return <Navigate to="/dashboard" replace />
  }
  return <>{children}</>
}
