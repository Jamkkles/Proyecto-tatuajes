import { useEffect, useState } from 'react'
import { apiErrorMessage } from '../lib/api'
import { sendTestPush } from '../lib/notifications'
import { disablePush, enablePush, readPushState, type PushState } from '../lib/push'
import './NotificationBell.css'

interface PushControlProps {
  /** Muestra además el botón de aviso de prueba (pantalla de ajustes). */
  withTest?: boolean
}

/**
 * Activar o apagar las notificaciones push de este dispositivo, y explicar por qué
 * no se puede cuando no se puede. Lo comparten la campanita y los ajustes.
 */
export default function PushControl({ withTest = false }: PushControlProps) {
  const [state, setState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let cancelled = false
    readPushState().then((s) => {
      if (!cancelled) setState(s)
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function run(action: () => Promise<PushState>, failure: string) {
    setBusy(true)
    setMessage('')
    try {
      setState(await action())
    } catch (err) {
      setMessage(apiErrorMessage(err, failure))
    } finally {
      setBusy(false)
    }
  }

  async function test() {
    setBusy(true)
    setMessage('')
    try {
      const { sent } = await sendTestPush()
      setMessage(
        sent > 0
          ? 'Listo: te mandamos un aviso de prueba.'
          : 'No encontramos ningún dispositivo suscrito. Activa los avisos y vuelve a probar.',
      )
    } catch (err) {
      setMessage(apiErrorMessage(err, 'No pudimos enviar el aviso de prueba.'))
    } finally {
      setBusy(false)
    }
  }

  if (!state) return <p className="push__hint">Revisando las notificaciones…</p>

  return (
    <div className="push">
      {state.kind === 'on' && (
        <>
          <p className="push__status push__status--on">Avisos activados en este dispositivo.</p>
          <div className="push__row">
            {withTest && (
              <button type="button" className="nb-btn" onClick={test} disabled={busy}>
                Enviar aviso de prueba
              </button>
            )}
            <button
              type="button"
              className="nb-btn"
              onClick={() => run(disablePush, 'No pudimos desactivarlos.')}
              disabled={busy}
            >
              Desactivar
            </button>
          </div>
        </>
      )}

      {state.kind === 'off' && (
        <>
          <p className="push__hint">
            Recibe un aviso en este dispositivo aunque la app esté cerrada: citas por recordar,
            insumos por reponer.
          </p>
          <button
            type="button"
            className="nb-btn nb-btn--primary"
            onClick={() => run(enablePush, 'No pudimos activar los avisos.')}
            disabled={busy}
          >
            {busy ? 'Activando…' : 'Activar avisos en este dispositivo'}
          </button>
        </>
      )}

      {state.kind === 'denied' && (
        <p className="push__hint">
          Bloqueaste las notificaciones de esta app. Para recibirlas, actívalas en los ajustes del
          navegador o del teléfono y vuelve aquí.
        </p>
      )}

      {state.kind === 'server-off' && (
        <p className="push__hint">Las notificaciones push aún no están activadas en el servidor.</p>
      )}

      {state.kind === 'unsupported' && state.reason === 'needs-install' && (
        <p className="push__hint">
          En el iPhone los avisos solo llegan si instalas la app: abre esta página en Safari, toca{' '}
          <strong>Compartir</strong> y elige <strong>«Añadir a pantalla de inicio»</strong>. Luego
          ábrela desde su ícono y activa los avisos aquí.
        </p>
      )}
      {state.kind === 'unsupported' && state.reason === 'no-support' && (
        <p className="push__hint">Este navegador no admite notificaciones push.</p>
      )}
      {state.kind === 'unsupported' && state.reason === 'dev' && (
        <p className="push__hint">
          Las notificaciones push solo funcionan en la versión publicada, no en desarrollo.
        </p>
      )}

      {message && (
        <p className="push__message" role="status">
          {message}
        </p>
      )}
    </div>
  )
}
