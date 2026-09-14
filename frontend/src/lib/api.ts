import { getToken, logout } from './token'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/** Texto para mostrar de un error: el del backend si es ApiError, si no `fallback`. */
export const apiErrorMessage = (err: unknown, fallback: string) =>
  err instanceof ApiError ? err.message : fallback

/**
 * Wrapper de fetch contra el backend. Resuelve con el JSON tipado o lanza
 * ApiError con un mensaje listo para mostrar al usuario.
 * status 0 = no se pudo contactar al servidor (red caída / sin conexión).
 *
 * Adjunta automáticamente el token de sesión si existe, y si el backend lo
 * rechaza (401 con token) cierra la sesión y devuelve al login: significa que
 * el JWT expiró o dejó de ser válido.
 */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken()
  const isFormData = init?.body instanceof FormData

  const headers: Record<string, string> = {
    // Con FormData el navegador debe poner el Content-Type él mismo, porque
    // incluye el `boundary` que separa las partes del multipart.
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((init?.headers as Record<string, string>) ?? {}),
  }

  let res: Response
  try {
    res = await fetch(`${BASE_URL}${path}`, { ...init, headers })
  } catch {
    throw new ApiError('No pudimos conectar con el servidor. Revisa tu conexión.', 0)
  }

  // 204 No Content (p. ej. un DELETE) no trae cuerpo que parsear.
  const data = res.status === 204 ? null : await res.json().catch(() => null)

  if (!res.ok) {
    if (res.status === 401 && token) {
      logout()
      window.location.replace('/')
    }
    const message =
      (data && typeof data.message === 'string' && data.message) ||
      'Algo salió mal. Inténtalo de nuevo.'
    throw new ApiError(message, res.status)
  }

  return data as T
}