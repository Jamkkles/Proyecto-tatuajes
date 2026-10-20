import { Navigate } from 'react-router-dom'
import { getUser, isAdmin, isAuthenticated } from '../lib/auth'
import type { ReactNode } from 'react'

/** Redirige al login si no hay sesión activa. */
export default function ProtectedRoute({ children }: { children: ReactNode }) {
  if (!isAuthenticated()) {
    return <Navigate to="/" replace />
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
