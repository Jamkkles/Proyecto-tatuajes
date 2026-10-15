import { apiFetch } from './api'

/**
 * WhatsApp vinculado: el artista enlaza su propio WhatsApp como «dispositivo vinculado»
 * y los mensajes a sus clientes salen desde ahí, gratis. No es la API oficial: WhatsApp
 * no permite automatizar así una cuenta y puede bloquear el número (ver el aviso en la
 * pantalla y `docs/whatsapp-y-notificaciones.md`).
 */
export type WhatsAppWebStatus = 'desactivado' | 'desvinculado' | 'esperando_codigo' | 'vinculado'

export interface WhatsAppWebState {
  status: WhatsAppWebStatus
  enabled: boolean
  /** Máximo de mensajes por hora que se envían por este canal. */
  perHour: number
  /** Solo en `esperando_codigo`: lo que el artista escribe en su teléfono. */
  pairingCode?: string
  phone?: string | null
  /** Solo en `vinculado`: si hay una conexión abierta ahora (se abre al enviar). */
  connected?: boolean
}

export const getWhatsAppWeb = () => apiFetch<WhatsAppWebState>('/api/whatsapp-web')

export const linkWhatsAppWeb = (phone: string) =>
  apiFetch<{ pairingCode: string }>('/api/whatsapp-web/link', {
    method: 'POST',
    // El servidor exige este campo: sin él no vincula, aunque la pantalla se lo saltara.
    body: JSON.stringify({ phone, acceptRisk: true }),
  })

export const testWhatsAppWeb = () => apiFetch<{ ok: boolean }>('/api/whatsapp-web/test', { method: 'POST' })

export const unlinkWhatsAppWeb = () => apiFetch<void>('/api/whatsapp-web/unlink', { method: 'POST' })

/** «56912345678» → «+56 9 1234 5678» (solo para móviles chilenos; otro número se muestra tal cual). */
export function prettyPhone(digits: string | null | undefined): string {
  if (!digits) return ''
  const m = /^56(9)(\d{4})(\d{4})$/.exec(digits)
  return m ? `+56 ${m[1]} ${m[2]} ${m[3]}` : `+${digits}`
}
