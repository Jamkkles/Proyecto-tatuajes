import { apiFetch } from './api'
import type { AuthUser } from './token'

// La sesión (token + usuario en localStorage) vive en token.ts; se reexporta
// aquí para que el resto de la app siga importando todo desde 'lib/auth'.
export {
  saveToken,
  getToken,
  clearToken,
  saveUser,
  getUser,
  logout,
  isAuthenticated,
} from './token'
export type { AuthUser } from './token'

export interface LoginInput {
  email: string
  password: string
}

export interface AuthResponse {
  token: string
  user: AuthUser
}

export interface RegisterInput {
  name: string
  email: string
  password: string
}

/** Crea una cuenta nueva (HU01). */
export function register(input: RegisterInput): Promise<AuthResponse> {
  return apiFetch<AuthResponse>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

/** Inicia sesión contra el backend (HU02). */
export function login(input: LoginInput): Promise<AuthResponse> {
  return apiFetch<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

/** Solicita un correo de recuperación (HU03). */
export function forgotPassword(email: string): Promise<{ message: string }> {
  return apiFetch<{ message: string }>('/api/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

/** Establece una nueva contraseña con el token del correo (HU03). */
export function resetPassword(token: string, password: string): Promise<{ message: string }> {
  return apiFetch<{ message: string }>('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, password }),
  })
}