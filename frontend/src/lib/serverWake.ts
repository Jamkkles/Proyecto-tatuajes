/**
 * Detecta cuándo el servidor está tardando en responder.
 *
 * En un alojamiento gratuito el backend se duerme tras unos minutos sin uso y
 * despertarlo lleva cerca de un minuto. Sin explicación, la primera pantalla
 * parece rota. Este módulo cuenta las peticiones en curso y avisa cuando
 * alguna lleva más de `SLOW_AFTER_MS`, para que la interfaz lo cuente.
 *
 * Es un almacén externo (suscripción + lectura) para leerlo con
 * `useSyncExternalStore` sin efectos ni estado duplicado.
 */
const SLOW_AFTER_MS = 4000

let pending = 0
let slow = 0
const listeners = new Set<() => void>()

const notify = () => listeners.forEach((listener) => listener())

export const subscribeSlowServer = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const isServerSlow = () => slow > 0

/**
 * Envuelve una petición: si tarda más de `SLOW_AFTER_MS` la marca como lenta
 * hasta que termine, con éxito o con error.
 */
export async function trackSlow<T>(work: Promise<T>): Promise<T> {
  pending += 1
  let counted = false
  const timer = setTimeout(() => {
    counted = true
    slow += 1
    notify()
  }, SLOW_AFTER_MS)

  try {
    return await work
  } finally {
    clearTimeout(timer)
    pending -= 1
    if (counted) {
      slow -= 1
      notify()
    }
  }
}

/** Solo para pruebas y depuración. */
export const pendingRequests = () => pending
