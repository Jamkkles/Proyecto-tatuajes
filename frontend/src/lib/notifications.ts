import { apiFetch } from './api'

/**
 * Avisos del artista (la campanita), preferencias de mensajes y mensajes al
 * cliente por WhatsApp (HU22, HU23, HU28).
 */

export type NotificationKind =
  | 'stock_bajo'
  | 'mensaje_manual'
  | 'mensaje_enviado'
  | 'mensaje_omitido'
  | (string & {})

export interface AppNotification {
  id: string
  kind: NotificationKind
  title: string
  body: string
  /** Ruta de la app a la que lleva al tocarla. */
  url: string | null
  /** Datos de la acción; `waLink` abre WhatsApp con el mensaje ya escrito. */
  data: { waLink?: string } & Record<string, unknown>
  read_at: string | null
  created_at: string
}

export interface NotificationFeed {
  notifications: AppNotification[]
  unread: number
}

export const listNotifications = (limit = 30) =>
  apiFetch<NotificationFeed>(`/api/notifications?limit=${limit}`)

export const markNotificationsRead = (target: { ids: string[] } | { all: true }) =>
  apiFetch<{ updated: number }>('/api/notifications/read', {
    method: 'POST',
    body: JSON.stringify(target),
  })

/* ---------------- Push ---------------- */

export interface PushConfig {
  enabled: boolean
  publicKey: string | null
}

export const getPushConfig = () => apiFetch<PushConfig>('/api/push/config')

export const savePushSubscription = (subscription: PushSubscriptionJSON) =>
  apiFetch<{ ok: boolean }>('/api/push/subscribe', {
    method: 'POST',
    body: JSON.stringify(subscription),
  })

export const removePushSubscription = (endpoint: string) =>
  apiFetch<void>('/api/push/unsubscribe', {
    method: 'POST',
    body: JSON.stringify({ endpoint }),
  })

export const sendTestPush = () => apiFetch<{ sent: number; removed: number }>('/api/push/test', { method: 'POST' })

/* ---------------- Preferencias de mensajes ---------------- */

export interface NotificationSettings {
  remindersEnabled: boolean
  changeNoticeEnabled: boolean
  aftercareEnabled: boolean
  reminderNote: string
  aftercareNote: string
}

export interface NotificationChannels {
  /** `automatico`: la API los envía sola. `manual`: se le deja un enlace al artista. */
  whatsapp: 'automatico' | 'manual'
  push: boolean
}

export interface NotificationSettingsResponse {
  settings: NotificationSettings
  channels: NotificationChannels
}

export const getNotificationSettings = () =>
  apiFetch<NotificationSettingsResponse>('/api/notification-settings')

export const saveNotificationSettings = (input: Partial<NotificationSettings>) =>
  apiFetch<NotificationSettingsResponse>('/api/notification-settings', {
    method: 'PUT',
    body: JSON.stringify(input),
  })

/** Límites que también valida el servidor; aquí sirven para el contador. */
export const MAX_REMINDER_NOTE = 300
export const MAX_AFTERCARE_NOTE = 600

/* ---------------- Mensajes al cliente ---------------- */

export type ClientMessageKind = 'recordatorio' | 'cuidados'

/** Lo que pasó con un mensaje al cliente. */
export interface MessageResult {
  status: 'enviado' | 'pendiente' | 'error' | 'omitido' | 'duplicado'
  channel: 'whatsapp' | 'manual' | 'ninguno'
  waLink?: string
  text?: string
  reason?: 'sin_telefono'
  error?: string | null
}

/**
 * Lo que devuelve el servidor al cambiar una sesión cuando al cliente hay que
 * avisarle (cancelación, cambio de hora, cuidados).
 */
export interface SessionNotice {
  kind: 'cancelacion' | 'reagendamiento' | 'cuidados'
  channel: 'whatsapp' | 'manual'
  status: MessageResult['status']
  waLink: string | null
}

export const sendSessionMessage = (sessionId: string, kind: ClientMessageKind) =>
  apiFetch<{ result: MessageResult }>(`/api/sessions/${sessionId}/message`, {
    method: 'POST',
    body: JSON.stringify({ kind }),
  }).then((r) => r.result)

/** Cómo se llama cada aviso, para decírselo al artista. */
export const noticeLabel = (kind: SessionNotice['kind']) =>
  ({
    cancelacion: 'la cancelación',
    reagendamiento: 'el cambio de hora',
    cuidados: 'los cuidados del tatuaje',
  })[kind]
