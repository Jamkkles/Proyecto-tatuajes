import { getPushConfig, removePushSubscription, savePushSubscription } from './notifications'

/**
 * Notificaciones push en el navegador o en la app instalada.
 *
 * Lo delicado está en iPhone: iOS solo ofrece push a las aplicaciones web
 * **instaladas en la pantalla de inicio** (iOS 16.4 o más). Dentro de una pestaña
 * de Safari ni siquiera existe `PushManager`, así que no basta con "pedir
 * permiso": primero hay que saber en cuál de los casos se está.
 */

export type PushState =
  /** El navegador no puede (o, en iPhone, falta instalar la app). */
  | { kind: 'unsupported'; reason: 'needs-install' | 'no-support' | 'dev' }
  /** El servidor no tiene las claves VAPID. */
  | { kind: 'server-off' }
  /** El usuario dijo que no; solo lo puede cambiar él en los ajustes. */
  | { kind: 'denied' }
  /** Se puede activar. */
  | { kind: 'off' }
  /** Activado en este dispositivo. */
  | { kind: 'on' }

export const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  // Los iPad recientes se presentan como Mac.
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

/** ¿Abierta desde la pantalla de inicio y no desde una pestaña? */
export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true

const hasPushApi = () =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

/** VAPID viaja en base64 url-safe y `subscribe` lo quiere en bytes. */
function toBytes(base64Url: string) {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4)
  const raw = atob((base64Url + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

/**
 * El service worker solo se registra en el build de producción (en desarrollo se
 * desregistra para no servir archivos viejos), así que en desarrollo no hay push.
 */
async function registration() {
  if (import.meta.env.DEV) return null
  return navigator.serviceWorker.ready
}

/** En qué estado está el push de este dispositivo. */
export async function readPushState(): Promise<PushState> {
  if (!hasPushApi()) {
    return { kind: 'unsupported', reason: isIOS() && !isStandalone() ? 'needs-install' : 'no-support' }
  }
  if (import.meta.env.DEV) return { kind: 'unsupported', reason: 'dev' }

  const config = await getPushConfig().catch(() => null)
  if (!config?.enabled) return { kind: 'server-off' }

  if (Notification.permission === 'denied') return { kind: 'denied' }
  const reg = await registration()
  const sub = await reg?.pushManager.getSubscription()
  return sub && Notification.permission === 'granted' ? { kind: 'on' } : { kind: 'off' }
}

/**
 * Activa el push: pide permiso, suscribe el dispositivo y se lo cuenta al
 * servidor. Tiene que llamarse desde un toque del usuario (iOS no deja pedir
 * permiso de otra forma).
 */
export async function enablePush(): Promise<PushState> {
  const state = await readPushState()
  if (state.kind !== 'off') return state

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return { kind: permission === 'denied' ? 'denied' : 'off' }

  const config = await getPushConfig()
  const reg = await registration()
  if (!config.publicKey || !reg) return { kind: 'server-off' }

  const subscription =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: toBytes(config.publicKey),
    }))
  await savePushSubscription(subscription.toJSON())
  return { kind: 'on' }
}

/** Apaga el push de este dispositivo, aquí y en el servidor. */
export async function disablePush(): Promise<PushState> {
  const reg = await registration()
  const sub = await reg?.pushManager.getSubscription()
  if (sub) {
    await removePushSubscription(sub.endpoint).catch(() => {})
    await sub.unsubscribe()
  }
  return { kind: 'off' }
}

/**
 * Al abrir la app con el permiso ya dado, vuelve a contarle al servidor este
 * dispositivo. Es barato (el servidor lo guarda por `endpoint`) y resuelve dos
 * cosas: que otra cuenta que inicie sesión en el mismo teléfono se quede con los
 * avisos, y que una suscripción que el navegador renovó no se pierda.
 */
export async function syncPushSubscription() {
  try {
    if (!hasPushApi() || import.meta.env.DEV || Notification.permission !== 'granted') return
    const config = await getPushConfig()
    if (!config.enabled || !config.publicKey) return
    const reg = await registration()
    if (!reg) return
    const subscription =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: toBytes(config.publicKey),
      }))
    await savePushSubscription(subscription.toJSON())
  } catch {
    // Es un refresco oportunista: si falla, el artista no tiene por qué enterarse.
  }
}
