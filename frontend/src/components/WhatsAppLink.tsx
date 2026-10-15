import { useEffect, useRef, useState } from 'react'
import { apiErrorMessage } from '../lib/api'
import {
  getWhatsAppWeb,
  linkWhatsAppWeb,
  prettyPhone,
  testWhatsAppWeb,
  unlinkWhatsAppWeb,
  type WhatsAppWebState,
} from '../lib/whatsappWeb'
import './WhatsAppLink.css'

interface WhatsAppLinkProps {
  /** Avisa a la página cuando cambia si hay un WhatsApp vinculado, para actualizar su aviso. */
  onLinkedChange?: (linked: boolean) => void
}

const POLL_MS = 3000

/**
 * Vincular el WhatsApp del artista para que los mensajes a sus clientes salgan solos
 * y gratis. Es la opción **no oficial**: el aviso del riesgo va por delante y hay que
 * aceptarlo para poder pedir el código.
 */
export default function WhatsAppLink({ onLinkedChange }: WhatsAppLinkProps) {
  const [state, setState] = useState<WhatsAppWebState | null>(null)
  const [loadError, setLoadError] = useState('')
  const [phone, setPhone] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  // La página puede pasar una función distinta en cada render; el sondeo no debe reiniciarse por eso.
  const notify = useRef(onLinkedChange)
  useEffect(() => {
    notify.current = onLinkedChange
  })

  // Se avisa a la página solo cuando cambia lo de «vinculado», no en cada sondeo.
  const wasLinked = useRef(false)
  function apply(next: WhatsAppWebState) {
    const linked = next.status === 'vinculado'
    setState(next)
    if (linked !== wasLinked.current) {
      wasLinked.current = linked
      notify.current?.(linked)
    }
  }

  useEffect(() => {
    let cancelled = false
    getWhatsAppWeb()
      .then((res) => {
        if (!cancelled) apply(res)
      })
      .catch((err) => {
        if (!cancelled) setLoadError(apiErrorMessage(err, 'No pudimos revisar tu WhatsApp vinculado.'))
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Mientras espera que el artista escriba el código en su teléfono, se revisa cada pocos segundos.
  const waiting = state?.status === 'esperando_codigo'
  useEffect(() => {
    if (!waiting) return
    const timer = setInterval(() => {
      getWhatsAppWeb()
        .then(apply)
        .catch(() => {})
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [waiting])

  async function run(action: () => Promise<void>, failure: string) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await action()
    } catch (err) {
      setError(apiErrorMessage(err, failure))
    } finally {
      setBusy(false)
    }
  }

  const requestCode = (e: React.FormEvent) => {
    e.preventDefault()
    return run(async () => {
      const { pairingCode } = await linkWhatsAppWeb(phone)
      setState((s) => (s ? { ...s, status: 'esperando_codigo', pairingCode } : s))
    }, 'No pudimos pedir el código.')
  }

  const sendTest = () =>
    run(async () => {
      await testWhatsAppWeb()
      setNotice('Listo: te mandamos un mensaje a ti mismo. Búscalo en «Mensajes contigo» de tu WhatsApp.')
    }, 'No pudimos enviar el mensaje de prueba.')

  const unlink = (question: string) => {
    if (!window.confirm(question)) return
    return run(async () => {
      await unlinkWhatsAppWeb()
      setAccepted(false)
      setPhone('')
      apply({ ...(state as WhatsAppWebState), status: 'desvinculado', pairingCode: undefined, phone: null })
    }, 'No pudimos desvincular.')
  }

  if (loadError) return <p className="wl__error" role="alert">{loadError}</p>
  if (!state) return <p className="wl__hint">Revisando…</p>
  if (!state.enabled) return null

  return (
    <div className="wl">
      {state.status === 'vinculado' && (
        <>
          <p className="wl__ok" role="status">
            <strong>WhatsApp vinculado</strong>
            {state.phone ? <> ({prettyPhone(state.phone)})</> : null}. Los recordatorios y avisos a tus
            clientes salen solos desde este número, hasta {state.perHour} por hora. Si uno falla, te llega
            el aviso para enviarlo a mano.
          </p>
          <div className="wl__actions">
            <button type="button" className="st-btn st-btn--sm" onClick={sendTest} disabled={busy}>
              {busy ? 'Un momento…' : 'Enviarme un mensaje de prueba'}
            </button>
            <button
              type="button"
              className="st-btn st-btn--sm st-btn--danger"
              onClick={() =>
                unlink('¿Desvincular tu WhatsApp? Los mensajes a tus clientes volverán a quedar para enviarlos a mano.')
              }
              disabled={busy}
            >
              Desvincular
            </button>
          </div>
        </>
      )}

      {state.status === 'esperando_codigo' && (
        <>
          <p className="wl__lead">Escribe este código en tu teléfono:</p>
          <p className="wl__code" aria-label="Código de vinculación">{state.pairingCode}</p>
          <ol className="wl__steps">
            <li>Abre WhatsApp y entra a <strong>Ajustes → Dispositivos vinculados</strong>.</li>
            <li>Toca <strong>Vincular un dispositivo</strong> y luego <strong>Vincular con el número de teléfono</strong>.</li>
            <li>Escribe el código de arriba. Esta pantalla se actualiza sola cuando quede listo.</li>
          </ol>
          <p className="wl__hint">El código dura unos minutos. Si no alcanzas, cancela y pide otro.</p>
          <button
            type="button"
            className="st-btn st-btn--sm"
            onClick={() => unlink('¿Cancelar la vinculación?')}
            disabled={busy}
          >
            Cancelar
          </button>
        </>
      )}

      {state.status === 'desvinculado' && (
        <form onSubmit={requestCode}>
          <div className="wl__warn" role="note">
            <strong>Léelo antes de vincular.</strong> Esta opción es gratis, pero <strong>no es la forma
            oficial</strong> de WhatsApp: los términos de WhatsApp no permiten automatizar mensajes desde
            una cuenta normal y, si lo detectan, <strong>pueden bloquear tu número</strong>. Para reducir
            el riesgo enviamos despacio (hasta {state.perHour} por hora), solo a números con WhatsApp y
            nunca en ráfaga. Úsalo con clientes que ya te escribieron o que aceptaron recibir avisos, y
            de preferencia con un número del estudio, no el personal.
          </div>

          <label className="wl__check">
            <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
            <span>Entiendo que mi número podría ser bloqueado por WhatsApp y lo acepto.</span>
          </label>

          <div className="st-field">
            <label className="st-label" htmlFor="wl-phone">Tu número de WhatsApp</label>
            <input
              id="wl-phone"
              className="st-input"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+56 9 1234 5678"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={!accepted}
            />
          </div>

          <button
            type="submit"
            className="st-btn st-btn--primary"
            disabled={busy || !accepted || phone.replace(/\D/g, '').length < 8}
          >
            {busy ? 'Pidiendo el código…' : 'Obtener código de vinculación'}
          </button>
        </form>
      )}

      {error && <p className="wl__error" role="alert">{error}</p>}
      {notice && <p className="wl__notice" role="status">{notice}</p>}
    </div>
  )
}
