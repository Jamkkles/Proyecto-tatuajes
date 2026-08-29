/**
 * Almacenamiento de la sesión en localStorage.
 *
 * Vive aparte de auth.ts porque api.ts necesita leer el token para firmar cada
 * petición, y auth.ts a su vez usa api.ts: separarlo evita el import circular.
 */
const TOKEN_KEY = 'ht_token'
const USER_KEY = 'ht_user'

export interface AuthUser {
  id: string
  name: string
  email: string
}

export function saveToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

export function saveUser(user: AuthUser): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function getUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as AuthUser
  } catch {
    return null
  }
}

/** Cierra la sesión: borra token y usuario guardados (HU02). */
export function logout(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

export function isAuthenticated(): boolean {
  return Boolean(getToken())
}