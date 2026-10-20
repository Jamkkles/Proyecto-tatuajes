import { apiFetch } from './api'

/*
 * «Mi estudio»: el dueño del estudio ve cuánto entró por tatuador en el mes. Solo montos
 * y conteos; el servidor responde 403 a quien no sea el dueño.
 */

export interface MyStudio {
  studio: { id: string; name?: string; plan?: string; tattooists_count?: number } | null
  isOwner: boolean
}

export const getMyStudio = () => apiFetch<MyStudio>('/api/studio')

export interface StudioTattooistSummary {
  id: string
  name: string
  active: boolean
  is_owner: boolean
  collected: number
  pending: number
  sessions_done: number
  appointments: number
}

export interface StudioSummary {
  studio: { id: string; name: string; plan: string }
  tattooists: StudioTattooistSummary[]
  totals: { collected: number; pending: number; sessionsDone: number; appointments: number }
}

export const getStudioSummary = (from: Date, to: Date) => {
  const params = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() })
  return apiFetch<StudioSummary>(`/api/studio/summary?${params}`)
}
