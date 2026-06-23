import { Navigate } from 'react-router-dom'
import { isAuthenticated } from '../lib/auth'
import type { ReactNode } from 'react'

/** Redirige al login si no hay sesión activa. */
export default function ProtectedRoute({ children }: { children: ReactNode }) {
  if (!isAuthenticated()) {
    return <Navigate to="/" replace />
  }
  return <>{children}</>
}
