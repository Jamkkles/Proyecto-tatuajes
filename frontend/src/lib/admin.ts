import { apiFetch } from './api'

/*
 * Administración de la plataforma (HU31–HU36, HU38). Solo la usa una cuenta con rol
 * `admin`; el servidor lo exige en cada ruta, la pantalla solo esconde el acceso.
 */

export type StudioPlan = 'basico' | 'profesional' | 'estudio'

export const PLANS: { value: StudioPlan; label: string }[] = [
  { value: 'basico', label: 'Básico' },
  { value: 'profesional', label: 'Profesional' },
  { value: 'estudio', label: 'Estudio' },
]

export const planLabel = (plan: StudioPlan) => PLANS.find((p) => p.value === plan)?.label ?? plan

export interface AdminTattooist {
  id: string
  name: string
  email: string
  role: 'tatuador' | 'admin'
  active: boolean
  /** Dueño del estudio: el único que ve «Mi estudio». */
  is_owner: boolean
  created_at: string
}

export interface AdminStudio {
  id: string
  name: string
  email: string
  plan: StudioPlan
  active: boolean
  deactivated_at: string | null
  owner_id: string | null
  created_at: string
  tattooists: AdminTattooist[]
  /** Métricas de uso sumando a todos sus tatuadores (HU36). */
  sessions_total: number
  upcoming_appointments: number
  sketches_total: number
  clients_total: number
  last_activity_at: string | null
}

export interface AdminTotals {
  studios: number
  activeStudios: number
  tattooists: number
  activeTattooists: number
  sessions: number
  upcomingAppointments: number
  sketches: number
  clients: number
}

/** Una cuenta de la plataforma, con su estudio y su uso (HU35, HU36). */
export interface AdminUser {
  id: string
  name: string
  email: string
  role: 'tatuador' | 'admin'
  active: boolean
  created_at: string
  studio_id: string | null
  is_owner: boolean
  studio_name: string | null
  studio_plan: StudioPlan | null
  studio_active: boolean | null
  sessions_total: number
  upcoming_appointments: number
  sketches_total: number
  clients_total: number
  last_activity_at: string | null
}

export const listAdminUsers = () => apiFetch<{ users: AdminUser[] }>('/api/admin/users').then((r) => r.users)

export const listAdminStudios = () =>
  apiFetch<{ studios: AdminStudio[]; totals: AdminTotals }>('/api/admin/studios')

export interface NewStudioInput {
  name: string
  email: string
  plan: StudioPlan
  ownerName: string
  /** Si no se indica, el tatuador entra con el correo del estudio. */
  ownerEmail?: string
}

/** Las cuentas nuevas traen su contraseña temporal: se muestra una sola vez. */
export const createAdminStudio = (input: NewStudioInput) =>
  apiFetch<{ studio: AdminStudio; user: AdminTattooist; temporaryPassword: string }>('/api/admin/studios', {
    method: 'POST',
    body: JSON.stringify(input),
  })

export const updateAdminStudio = (
  id: string,
  input: Partial<Pick<AdminStudio, 'name' | 'email' | 'plan' | 'active'>> & { ownerId?: string },
) =>
  apiFetch<{ studio: AdminStudio }>(`/api/admin/studios/${id}`, { method: 'PATCH', body: JSON.stringify(input) })

export const addAdminTattooist = (studioId: string, input: { name: string; email: string }) =>
  apiFetch<{ user: AdminTattooist; temporaryPassword: string }>(`/api/admin/studios/${studioId}/tattooists`, {
    method: 'POST',
    body: JSON.stringify(input),
  })

export const setAdminUserActive = (id: string, active: boolean) =>
  apiFetch<{ user: AdminTattooist }>(`/api/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify({ active }) })

export const resetAdminUserPassword = (id: string) =>
  apiFetch<{ temporaryPassword: string }>(`/api/admin/users/${id}/reset-password`, { method: 'POST' })
