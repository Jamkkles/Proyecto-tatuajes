import { useEffect, useState } from 'react'
import ChangePasswordForm from '../components/ChangePasswordForm'
import PushControl from '../components/PushControl'
import WhatsAppLink from '../components/WhatsAppLink'
import { apiErrorMessage } from '../lib/api'
import { getUser } from '../lib/auth'
import {
  MAX_AFTERCARE_NOTE,
  MAX_REMINDER_NOTE,
  getNotificationSettings,
  saveNotificationSettings,
  type NotificationChannels,
  type NotificationSettings,
} from '../lib/notifications'
import { useAppShellHeader } from '../lib/useAppShellHeader'
import './Studio.css'
import './Configuracion.css'

/**
 * Cómo se leen los mensajes al cliente. Son las mismas frases que arma el servidor
 * (`backend/src/services/clientMessages.js`): esto es solo la vista previa, y si se
 * cambia una frase allá hay que cambiarla aquí.
 */
const preview = {
  recordatorio: (artist: string, note: string) =>
    `Hola Ana, te recordamos tu cita con ${artist} el viernes 16 de octubre a las 15:30. ${note} ¡Te esperamos!`,
  cuidados: (artist: string, note: string) =>
    `Hola Ana, gracias por tu sesión con ${artist}. Cuidados de tu tatuaje: ${note} Cualquier duda, escríbenos.`,
}

/** Igual que hace el servidor al guardar: una sola línea, sin espacios repetidos. */
const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim()

const same = (a: NotificationSettings, b: NotificationSettings) =>
  (Object.keys(a) as (keyof NotificationSettings)[]).every((k) => a[k] === b[k])

export default function Configuracion() {
  useAppShellHeader({ title: 'Configuración', subtitle: 'Avisos y mensajes' })

  const artist = getUser()?.name?.trim().split(/\s+/)[0] ?? 'tu tatuador'

  const [saved, setSaved] = useState<NotificationSettings | null>(null)
  const [form, setForm] = useState<NotificationSettings | null>(null)
  const [channels, setChannels] = useState<NotificationChannels | null>(null)
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    getNotificationSettings()
      .then((res) => {
        if (cancelled) return
        setSaved(res.settings)
        setForm(res.settings)
        setChannels(res.channels)
      })
      .catch((err) => {
        if (!cancelled) setLoadError(apiErrorMessage(err, 'No pudimos cargar tu configuración.'))
      })
    return () => {
      cancelled = true
    }
  }, [])

  const dirty = saved && form ? !same(saved, form) : false

  function update<K extends keyof NotificationSettings>(key: K, value: NotificationSettings[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f))
    setMessage('')
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!form) return
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const res = await saveNotificationSettings(form)
      setSaved(res.settings)
      // El servidor junta los saltos de línea; se muestra lo que quedó guardado.
      setForm(res.settings)
      setMessage('Cambios guardados.')
    } catch (err) {
      setError(apiErrorMessage(err, 'No pudimos guardar los cambios.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="studio">
      <div className="st-body cfg">
        {/* ---------- Avisos en este dispositivo ---------- */}
        <section className="st-panel" aria-labelledby="cfg-push-h">
          <h2 className="st-h" id="cfg-push-h">Avisos en este dispositivo</h2>
          <p className="st-hint cfg__lead">
            Te avisamos cuando un insumo llega a su nivel crítico y cuando hay un mensaje por enviar
            a un cliente. También los verás siempre en la campanita.
          </p>
          <PushControl withTest />
        </section>

        {/* ---------- Mensajes a los clientes ---------- */}
        <form className="st-panel" onSubmit={handleSave} aria-labelledby="cfg-wa-h">
          <h2 className="st-h" id="cfg-wa-h">Mensajes a tus clientes por WhatsApp</h2>

          {loadError ? (
            <p className="st-empty st-empty--error" role="alert">{loadError}</p>
          ) : !form || !channels ? (
            <p className="st-empty">Cargando…</p>
          ) : (
            <>
              <p className={`cfg__channel cfg__channel--${channels.whatsapp}`} role="status">
                {channels.whatsapp === 'automatico' ? (
                  <>
                    <strong>WhatsApp conectado.</strong> Los mensajes salen solos; si alguno falla, te
                    llega un aviso para enviarlo tú.
                  </>
                ) : channels.whatsapp === 'vinculado' ? (
                  <>
                    <strong>Tu WhatsApp está vinculado.</strong> Los mensajes salen solos desde tu
                    número; si alguno falla, te llega un aviso para enviarlo tú.
                  </>
                ) : (
                  <>
                    <strong>Modo manual.</strong> Cada mensaje te llega como aviso con un botón «Enviar
                    por WhatsApp» que abre el chat con el texto ya escrito. Es gratis, seguro y funciona
                    con cualquier cliente.
                    {channels.whatsappWeb && ' Si prefieres que salgan solos, vincula tu WhatsApp más abajo.'}
                  </>
                )}
              </p>

              <fieldset className="cfg__group">
                <legend className="st-label">Qué mensajes quieres</legend>
                <label className="cfg__check">
                  <input
                    type="checkbox"
                    checked={form.remindersEnabled}
                    onChange={(e) => update('remindersEnabled', e.target.checked)}
                  />
                  <span>
                    Recordatorio 24 horas antes de cada cita
                    <small>Evita olvidos y ausencias.</small>
                  </span>
                </label>
                <label className="cfg__check">
                  <input
                    type="checkbox"
                    checked={form.changeNoticeEnabled}
                    onChange={(e) => update('changeNoticeEnabled', e.target.checked)}
                  />
                  <span>
                    Avisar si cancelo o cambio la hora de una cita
                    <small>Sale al guardar el cambio en la agenda.</small>
                  </span>
                </label>
                <label className="cfg__check">
                  <input
                    type="checkbox"
                    checked={form.aftercareEnabled}
                    onChange={(e) => update('aftercareEnabled', e.target.checked)}
                  />
                  <span>
                    Enviar los cuidados al terminar la sesión
                    <small>Sale cuando marcas la sesión como completada.</small>
                  </span>
                </label>
              </fieldset>

              <div className="st-field">
                <label className="st-label" htmlFor="cfg-reminder">Nota del recordatorio</label>
                <textarea
                  id="cfg-reminder"
                  className="st-input"
                  rows={2}
                  maxLength={MAX_REMINDER_NOTE}
                  value={form.reminderNote}
                  onChange={(e) => update('reminderNote', e.target.value)}
                />
                <p className="cfg__count">{form.reminderNote.length} / {MAX_REMINDER_NOTE}</p>
                <p className="cfg__preview" aria-label="Vista previa del recordatorio">
                  {preview.recordatorio(artist, oneLine(form.reminderNote) || '…')}
                </p>
              </div>

              <div className="st-field">
                <label className="st-label" htmlFor="cfg-aftercare">Cuidados después del tatuaje</label>
                <textarea
                  id="cfg-aftercare"
                  className="st-input"
                  rows={4}
                  maxLength={MAX_AFTERCARE_NOTE}
                  value={form.aftercareNote}
                  onChange={(e) => update('aftercareNote', e.target.value)}
                />
                <p className="cfg__count">{form.aftercareNote.length} / {MAX_AFTERCARE_NOTE}</p>
                <p className="cfg__preview" aria-label="Vista previa del mensaje de cuidados">
                  {preview.cuidados(artist, oneLine(form.aftercareNote) || '…')}
                </p>
              </div>

              <p className="st-hint">
                Los textos van en una sola línea: si pegas un párrafo con saltos de línea, se juntan.
              </p>

              {error && <p className="st-alert" role="alert">{error}</p>}
              {message && <p className="st-notice" role="status">{message}</p>}

              <button type="submit" className="st-btn st-btn--primary" disabled={saving || !dirty}>
                {saving ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </>
          )}
        </form>

        {/* ---------- Envío automático gratis (no oficial) ---------- */}
        {channels?.whatsappWeb && channels.whatsapp !== 'automatico' && (
          <section className="st-panel" aria-labelledby="cfg-link-h">
            <h2 className="st-h" id="cfg-link-h">Enviar los mensajes solos, gratis</h2>
            <p className="st-hint cfg__lead">
              Vincula tu WhatsApp como un dispositivo más (igual que WhatsApp Web) y los recordatorios
              saldrán desde tu número sin que tengas que hacer nada.
            </p>
            <WhatsAppLink
              onLinkedChange={(linked) =>
                setChannels((c) => (c ? { ...c, whatsapp: linked ? 'vinculado' : 'manual' } : c))
              }
            />
          </section>
        )}

        {/* ---------- Contraseña ---------- */}
        <section className="st-panel" aria-labelledby="cfg-pw-h">
          <h2 className="st-h" id="cfg-pw-h">Cambiar contraseña</h2>
          <ChangePasswordForm />
        </section>
      </div>
    </div>
  )
}
