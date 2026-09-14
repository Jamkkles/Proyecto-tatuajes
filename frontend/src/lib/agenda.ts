import { apiFetch } from './api'
import { isoLocal } from './dates'

/**
 * Agenda del estudio: clientes, proyectos y sesiones (HU17–HU21, HU24).
 *
 *   cliente 1─N proyecto 1─N sesión 1─N foto de avance
 *
 * Cada sesión es una cita: tiene fecha, hora y lo que se cobra en ella. El
 * proyecto lleva el precio total y puede enlazar el boceto de la galería y la
 * escena 3D donde se probó sobre el cuerpo.
 *
 * Los montos son pesos chilenos enteros.
 */

/* ---------------- Estados ---------------- */

export type ProjectStatus = 'activo' | 'terminado' | 'cancelado'
export type SessionStatus = 'agendada' | 'completada' | 'cancelada' | 'no_asistio'

export const PROJECT_STATUSES: { value: ProjectStatus; label: string }[] = [
  { value: 'activo', label: 'Activo' },
  { value: 'terminado', label: 'Terminado' },
  { value: 'cancelado', label: 'Cancelado' },
]

export const SESSION_STATUSES: { value: SessionStatus; label: string }[] = [
  { value: 'agendada', label: 'Agendada' },
  { value: 'completada', label: 'Completada' },
  { value: 'cancelada', label: 'Cancelada' },
  { value: 'no_asistio', label: 'No asistió' },
]

export const sessionStatusLabel = (status: SessionStatus) =>
  SESSION_STATUSES.find((s) => s.value === status)?.label ?? status

export const projectStatusLabel = (status: ProjectStatus) =>
  PROJECT_STATUSES.find((s) => s.value === status)?.label ?? status

/* ---------------- Tipos ---------------- */

export interface Client {
  id: string
  user_id: string
  name: string
  phone: string | null
  email: string | null
  instagram: string | null
  notes: string | null
  projects_count: number
  next_session_at: string | null
  created_at: string
  updated_at: string
}

export interface ClientInput {
  name: string
  phone?: string | null
  email?: string | null
  instagram?: string | null
  notes?: string | null
}

export interface Project {
  id: string
  user_id: string
  client_id: string
  title: string
  description: string | null
  body_zone: string | null
  total_price: number
  status: ProjectStatus
  sketch_id: string | null
  preview_id: string | null
  created_at: string
  updated_at: string
  // Resumen calculado por el backend.
  client_name: string
  client_phone: string | null
  sketch_url: string | null
  preview_name: string | null
  sessions_count: number
  /** Suma de lo que se cobra en las sesiones no canceladas. */
  planned_amount: number
  /** Suma de las sesiones ya pagadas. */
  paid_amount: number
  next_session_at: string | null
}

export interface ProjectInput {
  title: string
  description?: string | null
  bodyZone?: string | null
  totalPrice?: number
  status?: ProjectStatus
  sketchId?: string | null
  previewId?: string | null
}

export interface SessionPhoto {
  id: string
  session_id: string
  caption: string | null
  url: string
  width: number | null
  height: number | null
  created_at: string
}

export interface ProjectSession {
  id: string
  user_id: string
  project_id: string
  starts_at: string
  duration_minutes: number
  /** Lo que el cliente paga en esta sesión. */
  price: number
  paid: boolean
  status: SessionStatus
  notes: string | null
  created_at: string
  updated_at: string
  photos: SessionPhoto[]
}

/** Una cita tal como la ve el calendario: con su proyecto y cliente. */
export interface CalendarSession extends Omit<ProjectSession, 'photos'> {
  project_title: string
  body_zone: string | null
  client_id: string
  client_name: string
  client_phone: string | null
}

export interface SessionInput {
  startsAt: string
  durationMinutes?: number
  price?: number
  paid?: boolean
  status?: SessionStatus
  notes?: string | null
}

/* ---------------- Clientes ---------------- */

export function listClients(q = ''): Promise<Client[]> {
  const query = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''
  return apiFetch<{ clients: Client[] }>(`/api/clients${query}`).then((r) => r.clients)
}

export function getClient(id: string): Promise<{ client: Client; projects: Project[] }> {
  return apiFetch(`/api/clients/${id}`)
}

export function createClient(input: ClientInput): Promise<Client> {
  return apiFetch<{ client: Client }>('/api/clients', {
    method: 'POST',
    body: JSON.stringify(input),
  }).then((r) => r.client)
}

export function updateClient(id: string, input: Partial<ClientInput>): Promise<Client> {
  return apiFetch<{ client: Client }>(`/api/clients/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  }).then((r) => r.client)
}

export function deleteClient(id: string): Promise<void> {
  return apiFetch<void>(`/api/clients/${id}`, { method: 'DELETE' })
}

/* ---------------- Proyectos ---------------- */

export function listProjects(filters: { clientId?: string; status?: ProjectStatus } = {}) {
  const params = new URLSearchParams()
  if (filters.clientId) params.set('clientId', filters.clientId)
  if (filters.status) params.set('status', filters.status)
  const query = params.toString()
  return apiFetch<{ projects: Project[] }>(`/api/projects${query ? `?${query}` : ''}`).then(
    (r) => r.projects,
  )
}

export function getProject(id: string): Promise<{ project: Project; sessions: ProjectSession[] }> {
  return apiFetch(`/api/projects/${id}`)
}

export function createProject(clientId: string, input: ProjectInput): Promise<Project> {
  return apiFetch<{ project: Project }>('/api/projects', {
    method: 'POST',
    body: JSON.stringify({ clientId, ...input }),
  }).then((r) => r.project)
}

export function updateProject(id: string, input: Partial<ProjectInput>): Promise<Project> {
  return apiFetch<{ project: Project }>(`/api/projects/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  }).then((r) => r.project)
}

export function deleteProject(id: string): Promise<void> {
  return apiFetch<void>(`/api/projects/${id}`, { method: 'DELETE' })
}

/* ---------------- Sesiones ---------------- */

/** Citas en el rango [from, to). */
export function listSessions(from: Date, to: Date): Promise<CalendarSession[]> {
  const params = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() })
  return apiFetch<{ sessions: CalendarSession[] }>(`/api/sessions?${params}`).then(
    (r) => r.sessions,
  )
}

/**
 * Citas agrupadas por día local ('YYYY-MM-DD'), en el orden recibido.
 * Las canceladas no cuentan.
 */
export function groupSessionsByDay(sessions: CalendarSession[]): Record<string, CalendarSession[]> {
  const groups: Record<string, CalendarSession[]> = {}
  for (const s of sessions) {
    if (s.status === 'cancelada') continue
    const key = isoLocal(new Date(s.starts_at))
    ;(groups[key] ??= []).push(s)
  }
  return groups
}

/** Nº de citas por día local, el formato que espera MonthCalendar. */
export function countSessionsByDay(sessions: CalendarSession[]): Record<string, number> {
  return Object.fromEntries(
    Object.entries(groupSessionsByDay(sessions)).map(([day, list]) => [day, list.length]),
  )
}

export function createSession(projectId: string, input: SessionInput): Promise<ProjectSession> {
  return apiFetch<{ session: ProjectSession }>('/api/sessions', {
    method: 'POST',
    body: JSON.stringify({ projectId, ...input }),
  }).then((r) => r.session)
}

/** Devuelve la sesión sin fotos: quien la muestre conserva las que ya tenía. */
export function updateSession(
  id: string,
  input: Partial<SessionInput>,
): Promise<Omit<ProjectSession, 'photos'>> {
  return apiFetch<{ session: Omit<ProjectSession, 'photos'> }>(`/api/sessions/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  }).then((r) => r.session)
}

export function deleteSession(id: string): Promise<void> {
  return apiFetch<void>(`/api/sessions/${id}`, { method: 'DELETE' })
}

export function addSessionPhoto(sessionId: string, file: File, caption?: string) {
  const form = new FormData()
  form.append('image', file)
  if (caption?.trim()) form.append('caption', caption.trim())
  return apiFetch<{ photo: SessionPhoto }>(`/api/sessions/${sessionId}/photos`, {
    method: 'POST',
    body: form,
  }).then((r) => r.photo)
}

export function deleteSessionPhoto(sessionId: string, photoId: string): Promise<void> {
  return apiFetch<void>(`/api/sessions/${sessionId}/photos/${photoId}`, { method: 'DELETE' })
}

/* ---------------- Formato ---------------- */

const clp = new Intl.NumberFormat('es-CL', {
  style: 'currency',
  currency: 'CLP',
  maximumFractionDigits: 0,
})

/** 150000 → "$150.000" */
export const formatCLP = (amount: number) => clp.format(amount)

/**
 * Lee un monto escrito a mano: "150.000", "$150.000" o "150000" → 150000.
 * El CLP no usa decimales, así que todo lo que no es dígito se ignora.
 */
export function parseCLP(text: string): number {
  const digits = text.replace(/\D/g, '')
  return digits ? Number(digits) : 0
}

/** 150000 → "150.000", para rellenar un input de monto. */
export const formatAmountInput = (amount: number) =>
  amount ? new Intl.NumberFormat('es-CL').format(amount) : ''

/** 90 → "1 h 30 min" */
export function formatDuration(minutes: number) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h && m) return `${h} h ${m} min`
  return h ? `${h} h` : `${m} min`
}

/** Opciones del selector de duración, en minutos. */
export const DURATION_OPTIONS = [30, 60, 90, 120, 180, 240, 300, 360, 480]

// 24 h ("16:00"), como el resto de la app; es-CL por defecto usa "04:00 p. m.".
const timeFmt = new Intl.DateTimeFormat('es-CL', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})
const dateFmt = new Intl.DateTimeFormat('es-CL', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

export const formatTime = (iso: string) => timeFmt.format(new Date(iso))
export const formatDate = (iso: string) => dateFmt.format(new Date(iso))

/** Enlace de WhatsApp para escribirle al cliente (solo dígitos, con código país). */
export function whatsappLink(phone: string | null) {
  if (!phone) return null
  let digits = phone.replace(/\D/g, '')
  // Celular chileno escrito sin código de país: 9 dígitos que parten en 9.
  if (digits.length === 9 && digits.startsWith('9')) digits = `56${digits}`
  return digits.length >= 8 ? `https://wa.me/${digits}` : null
}
