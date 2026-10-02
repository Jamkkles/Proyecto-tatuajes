import { useSyncExternalStore } from 'react'
import { isServerSlow, subscribeSlowServer } from '../lib/serverWake'
import './ServerWakeNotice.css'

/**
 * Aviso de que el servidor está despertando. Aparece solo si una petición
 * lleva varios segundos sin respuesta y desaparece al terminar.
 */
export default function ServerWakeNotice() {
  const slow = useSyncExternalStore(subscribeSlowServer, isServerSlow, () => false)
  if (!slow) return null

  return (
    <div className="wake-notice" role="status" aria-live="polite">
      <span className="wake-notice__dot" aria-hidden="true" />
      El servidor está despertando. Puede tardar hasta un minuto la primera vez.
    </div>
  )
}
