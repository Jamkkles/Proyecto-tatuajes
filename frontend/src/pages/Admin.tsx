import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiErrorMessage } from '../lib/api'
import {
  PLANS,
  addAdminTattooist,
  createAdminStudio,
  listAdminStudios,
  listAdminUsers,
  planLabel,
  resetAdminUserPassword,
  setAdminUserActive,
  updateAdminStudio,
  type AdminStudio,
  type AdminTattooist,
  type AdminTotals,
  type AdminUser,
  type StudioPlan,
} from '../lib/admin'
import { formatDate } from '../lib/agenda'
import { getUser } from '../lib/auth'
import { useAppShellHeader } from '../lib/useAppShellHeader'
import './Studio.css'
import './Admin.css'

/** Una contraseña temporal recién creada: se muestra una vez y se olvida al cerrarla. */
interface Secret {
  studioId: string
  email: string
  password: string
  reason: string
}

type StatusFilter = 'todos' | 'activos' | 'desactivados'
type Tab = 'usuarios' | 'estudios'
type UserFilter = 'todos' | 'activos' | 'desactivados' | 'admins'

const USER_FILTERS: { value: UserFilter; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'activos', label: 'Activos' },
  { value: 'desactivados', label: 'Desactivados' },
  { value: 'admins', label: 'Administradores' },
]

const EMPTY_STUDIO = { name: '', email: '', plan: 'basico' as StudioPlan, ownerName: '', ownerEmail: '' }

/**
 * Panel del administrador de la plataforma: estudios, sus tatuadores y su uso
 * (HU31–HU36, HU38). Cada tatuador conserva sus propios datos: aquí solo se gestionan
 * cuentas y acceso.
 */
export default function Admin() {
  useAppShellHeader({ title: 'Administración', subtitle: 'Usuarios y estudios' })
  const me = getUser()

  const [tab, setTab] = useState<Tab>('usuarios')
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [userFilter, setUserFilter] = useState<UserFilter>('todos')
  const [studios, setStudios] = useState<AdminStudio[] | null>(null)
  const [totals, setTotals] = useState<AdminTotals | null>(null)
  const [loadError, setLoadError] = useState('')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('todos')
  const [secret, setSecret] = useState<Secret | null>(null)
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const [form, setForm] = useState(EMPTY_STUDIO)
  const [formError, setFormError] = useState('')

  // Usuarios y estudios se piden juntos: un cambio en uno se refleja en el otro.
  const fetchAll = () =>
    Promise.all([listAdminStudios(), listAdminUsers()]).then(([data, list]) => ({ ...data, users: list }))

  const apply = useCallback((data: { studios: AdminStudio[]; totals: AdminTotals; users: AdminUser[] }) => {
    setStudios(data.studios)
    setTotals(data.totals)
    setUsers(data.users)
    setLoadError('')
  }, [])

  /** Vuelve a pedir los listados tras un cambio, para que las métricas queden al día. */
  const reload = useCallback(() => fetchAll().then(apply), [apply])

  useEffect(() => {
    let cancelled = false
    fetchAll()
      .then((data) => {
        if (!cancelled) apply(data)
      })
      .catch((err) => {
        if (!cancelled) setLoadError(apiErrorMessage(err, 'No pudimos cargar los estudios.'))
      })
    return () => {
      cancelled = true
    }
  }, [apply])

  /** Corre una acción, muestra su error si falla y recarga el listado si sale bien. */
  async function act(key: string, work: () => Promise<void>, failure: string) {
    setBusy(key)
    setNotice('')
    try {
      await work()
      await reload()
    } catch (err) {
      setNotice(apiErrorMessage(err, failure))
    } finally {
      setBusy(null)
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.email.trim() || !form.ownerName.trim()) {
      return setFormError('Completa el nombre y correo del estudio y el nombre del tatuador.')
    }
    setFormError('')
    await act(
      'create',
      async () => {
        const res = await createAdminStudio({
          name: form.name.trim(),
          email: form.email.trim(),
          plan: form.plan,
          ownerName: form.ownerName.trim(),
          ownerEmail: form.ownerEmail.trim() || undefined,
        })
        setSecret({
          studioId: res.studio.id,
          email: res.user.email,
          password: res.temporaryPassword,
          reason: `Estudio «${res.studio.name}» creado.`,
        })
        setForm(EMPTY_STUDIO)
      },
      'No pudimos crear el estudio.',
    )
  }

  const visibleUsers = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (users ?? []).filter((u) => {
      if (userFilter === 'activos' && !u.active) return false
      if (userFilter === 'desactivados' && u.active) return false
      if (userFilter === 'admins' && u.role !== 'admin') return false
      if (!q) return true
      return [u.name, u.email, u.studio_name ?? ''].some((v) => v.toLowerCase().includes(q))
    })
  }, [users, query, userFilter])

  const toggleUser = (u: AdminUser) => {
    const question = u.active
      ? `¿Desactivar la cuenta de ${u.name}? No podrá entrar y su sesión abierta se cerrará. Sus datos se conservan.`
      : `¿Reactivar la cuenta de ${u.name}?`
    if (!window.confirm(question)) return
    act(`user-${u.id}`, async () => void (await setAdminUserActive(u.id, !u.active)), 'No pudimos cambiar el estado de la cuenta.')
  }

  const resetUserPassword = (u: AdminUser) => {
    if (!window.confirm(`¿Restablecer la contraseña de ${u.name}? La actual dejará de servir.`)) return
    act(
      `reset-${u.id}`,
      async () => {
        const { temporaryPassword } = await resetAdminUserPassword(u.id)
        setSecret({ studioId: u.studio_id ?? '', email: u.email, password: temporaryPassword, reason: 'Contraseña restablecida.' })
      },
      'No pudimos restablecer la contraseña.',
    )
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (studios ?? []).filter((s) => {
      if (statusFilter === 'activos' && !s.active) return false
      if (statusFilter === 'desactivados' && s.active) return false
      if (!q) return true
      return [s.name, s.email, ...s.tattooists.flatMap((t) => [t.name, t.email])].some((v) => v.toLowerCase().includes(q))
    })
  }, [studios, query, statusFilter])

  return (
    <div className="studio">
      <div className="st-body adm">
        {/* ---------- Totales (HU36) ---------- */}
        {totals && (
          <section className="adm-totals" aria-label="Uso de la plataforma">
            <Tile value={`${totals.activeStudios}/${totals.studios}`} label="Estudios activos" />
            <Tile value={`${totals.activeTattooists}/${totals.tattooists}`} label="Tatuadores activos" />
            <Tile value={totals.sessions} label="Sesiones registradas" />
            <Tile value={totals.upcomingAppointments} label="Citas por venir" />
            <Tile value={totals.sketches} label="Bocetos" />
            <Tile value={totals.clients} label="Clientes" />
          </section>
        )}

        {secret && (
          <div className="adm-secret" role="status">
            <p>
              <strong>{secret.reason}</strong> Contraseña temporal de <strong>{secret.email}</strong>:
            </p>
            <code className="adm-secret__code">{secret.password}</code>
            <p className="adm-secret__hint">
              Cópiala y entrégasela ahora: no se vuelve a mostrar. Con ella entra en la página de inicio de sesión.
            </p>
            <div className="st-actions st-actions--tight">
              <button
                type="button"
                className="st-btn st-btn--sm"
                onClick={() => navigator.clipboard?.writeText(secret.password).then(() => setNotice('Contraseña copiada.'))}
              >
                Copiar
              </button>
              <button type="button" className="st-btn st-btn--sm" onClick={() => setSecret(null)}>
                Listo, ya la guardé
              </button>
            </div>
          </div>
        )}

        {notice && (
          <p className="st-notice" role="status" onAnimationEnd={() => setNotice('')}>
            {notice}
          </p>
        )}

        <div className="adm-tabs" role="tablist" aria-label="Qué administrar">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'usuarios'}
            className={`adm-tab${tab === 'usuarios' ? ' is-active' : ''}`}
            onClick={() => setTab('usuarios')}
          >
            Usuarios {users && <span className="st-chip__n">{users.length}</span>}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'estudios'}
            className={`adm-tab${tab === 'estudios' ? ' is-active' : ''}`}
            onClick={() => setTab('estudios')}
          >
            Estudios {studios && <span className="st-chip__n">{studios.length}</span>}
          </button>
        </div>

        {tab === 'usuarios' ? (
          <section className="st-panel" aria-labelledby="adm-users-h">
            <div className="st-panel__head">
              <h2 className="st-h" id="adm-users-h">
                Todos los usuarios <span className="st-count">{visibleUsers.length}</span>
              </h2>
              <input
                className="st-input st-input--search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por nombre, correo o estudio…"
                aria-label="Buscar usuarios"
              />
            </div>
            <div className="st-chips" role="group" aria-label="Filtrar usuarios">
              {USER_FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  className={`st-chip${userFilter === f.value ? ' is-active' : ''}`}
                  aria-pressed={userFilter === f.value}
                  onClick={() => setUserFilter(f.value)}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {loadError ? (
              <p className="st-empty st-empty--error" role="alert">{loadError}</p>
            ) : !users ? (
              <p className="st-empty">Cargando usuarios…</p>
            ) : visibleUsers.length === 0 ? (
              <p className="st-empty">Ningún usuario coincide.</p>
            ) : (
              <ul className="adm-people adm-people--all">
                {visibleUsers.map((u) => (
                  <li key={u.id} className={`adm-person${u.active ? '' : ' is-off'}`}>
                    <span className="adm-person__main">
                      <span className="adm-person__name">
                        {u.name}
                        {u.id === me?.id && <span className="st-badge">Tú</span>}
                        {u.role === 'admin' && <span className="st-badge adm-role">Admin</span>}
                        {u.is_owner && <span className="st-badge">Dueño</span>}
                        {!u.active && <span className="st-badge adm-off">Desactivado</span>}
                        {u.active && u.studio_active === false && <span className="st-badge adm-off">Estudio desactivado</span>}
                      </span>
                      <span className="adm-person__mail">
                        {u.email} · {u.studio_name ? `${u.studio_name} (${planLabel(u.studio_plan ?? 'basico')})` : 'sin estudio'}
                      </span>
                      <span className="adm-person__mail">
                        {u.sessions_total} sesiones · {u.upcoming_appointments} citas por venir · {u.sketches_total} bocetos ·{' '}
                        {u.clients_total} clientes · desde {formatDate(u.created_at)}
                        {u.last_activity_at ? ` · última actividad ${formatDate(u.last_activity_at)}` : ''}
                      </span>
                    </span>
                    <span className="adm-person__actions">
                      <button type="button" className="st-btn st-btn--sm" disabled={busy !== null} onClick={() => resetUserPassword(u)}>
                        Restablecer contraseña
                      </button>
                      {u.id !== me?.id && (
                        <button
                          type="button"
                          className={`st-btn st-btn--sm${u.active ? ' st-btn--danger' : ''}`}
                          disabled={busy !== null}
                          onClick={() => toggleUser(u)}
                        >
                          {u.active ? 'Desactivar' : 'Reactivar'}
                        </button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : (
        <div className="adm-cols">
          {/* ---------- Estudios y tatuadores (HU32–HU36, HU38) ---------- */}
          <section className="st-panel" aria-labelledby="adm-list-h">
            <div className="st-panel__head">
              <h2 className="st-h" id="adm-list-h">
                Estudios <span className="st-count">{visible.length}</span>
              </h2>
              <input
                className="st-input st-input--search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar estudio, tatuador o correo…"
                aria-label="Buscar estudios"
              />
            </div>
            <div className="st-chips" role="group" aria-label="Filtrar por estado">
              {(['todos', 'activos', 'desactivados'] as StatusFilter[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  className={`st-chip${statusFilter === f ? ' is-active' : ''}`}
                  aria-pressed={statusFilter === f}
                  onClick={() => setStatusFilter(f)}
                >
                  {f === 'todos' ? 'Todos' : f === 'activos' ? 'Activos' : 'Desactivados'}
                </button>
              ))}
            </div>

            {loadError ? (
              <p className="st-empty st-empty--error" role="alert">{loadError}</p>
            ) : !studios ? (
              <p className="st-empty">Cargando estudios…</p>
            ) : visible.length === 0 ? (
              <p className="st-empty">Ningún estudio coincide.</p>
            ) : (
              <ul className="adm-studios">
                {visible.map((s) => (
                  <StudioCard
                    key={s.id}
                    studio={s}
                    myId={me?.id}
                    busy={busy}
                    act={act}
                    onSecret={setSecret}
                  />
                ))}
              </ul>
            )}
          </section>
          {/* ---------- Nuevo estudio (HU31) ---------- */}
          <section className="st-panel" aria-labelledby="adm-new-h">
            <h2 className="st-h" id="adm-new-h">Nuevo estudio</h2>
            <form onSubmit={handleCreate} noValidate>
              <Field id="adm-name" label="Nombre del estudio" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
              <Field
                id="adm-email"
                label="Correo del estudio"
                type="email"
                value={form.email}
                onChange={(v) => setForm({ ...form, email: v })}
              />
              <div className="st-field">
                <label className="st-label" htmlFor="adm-plan">Plan contratado</label>
                <select
                  id="adm-plan"
                  className="st-input"
                  value={form.plan}
                  onChange={(e) => setForm({ ...form, plan: e.target.value as StudioPlan })}
                >
                  {PLANS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>
              <Field
                id="adm-owner"
                label="Nombre del primer tatuador"
                value={form.ownerName}
                onChange={(v) => setForm({ ...form, ownerName: v })}
              />
              <Field
                id="adm-owner-email"
                label="Correo del tatuador (opcional)"
                type="email"
                placeholder="Si lo dejas vacío, entra con el del estudio"
                value={form.ownerEmail}
                onChange={(v) => setForm({ ...form, ownerEmail: v })}
              />
              <p className="st-hint">
                Se crea la cuenta del tatuador con una contraseña temporal que verás una sola vez. Cada
                tatuador ve solo sus propios datos.
              </p>
              {formError && <p className="st-alert" role="alert">{formError}</p>}
              <div className="st-actions">
                <button className="st-btn st-btn--primary" type="submit" disabled={busy === 'create'}>
                  {busy === 'create' ? 'Creando…' : 'Crear estudio'}
                </button>
              </div>
            </form>
          </section>

        </div>
        )}
      </div>
    </div>
  )
}

function Tile({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="adm-tile">
      <span className="adm-tile__value">{value}</span>
      <span className="adm-tile__label">{label}</span>
    </div>
  )
}

function Field(props: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
}) {
  return (
    <div className="st-field">
      <label className="st-label" htmlFor={props.id}>{props.label}</label>
      <input
        id={props.id}
        className="st-input"
        type={props.type ?? 'text'}
        value={props.value}
        placeholder={props.placeholder}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </div>
  )
}

function StudioCard({
  studio,
  myId,
  busy,
  act,
  onSecret,
}: {
  studio: AdminStudio
  myId?: string
  busy: string | null
  act: (key: string, work: () => Promise<void>, failure: string) => Promise<void>
  onSecret: (s: Secret) => void
}) {
  const [adding, setAdding] = useState(false)
  const [newT, setNewT] = useState({ name: '', email: '' })

  const toggleStudio = () => {
    const off = studio.active
    const question = off
      ? `¿Desactivar «${studio.name}»? Sus ${studio.tattooists.length} tatuadores no podrán entrar hasta que lo reactives. Sus datos se conservan.`
      : `¿Reactivar «${studio.name}»? Sus tatuadores activos podrán volver a entrar.`
    if (!window.confirm(question)) return
    act(`studio-${studio.id}`, async () => void (await updateAdminStudio(studio.id, { active: !studio.active })), 'No pudimos cambiar el estado del estudio.')
  }

  const toggleUser = (t: AdminTattooist) => {
    const question = t.active
      ? `¿Desactivar la cuenta de ${t.name}? No podrá entrar y su sesión abierta se cerrará. Sus datos se conservan.`
      : `¿Reactivar la cuenta de ${t.name}?`
    if (!window.confirm(question)) return
    act(`user-${t.id}`, async () => void (await setAdminUserActive(t.id, !t.active)), 'No pudimos cambiar el estado de la cuenta.')
  }

  const makeOwner = (t: AdminTattooist) => {
    if (!window.confirm(`¿Hacer a ${t.name} dueño de «${studio.name}»? Verá cuánto cobra cada tatuador del estudio, y el dueño actual dejará de verlo.`)) return
    act(`owner-${studio.id}`, async () => void (await updateAdminStudio(studio.id, { ownerId: t.id })), 'No pudimos cambiar el dueño.')
  }

  const resetPassword = (t: AdminTattooist) => {
    if (!window.confirm(`¿Restablecer la contraseña de ${t.name}? La actual dejará de servir.`)) return
    act(
      `reset-${t.id}`,
      async () => {
        const { temporaryPassword } = await resetAdminUserPassword(t.id)
        onSecret({ studioId: studio.id, email: t.email, password: temporaryPassword, reason: 'Contraseña restablecida.' })
      },
      'No pudimos restablecer la contraseña.',
    )
  }

  const addTattooist = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newT.name.trim() || !newT.email.trim()) return
    act(
      `add-${studio.id}`,
      async () => {
        const res = await addAdminTattooist(studio.id, { name: newT.name.trim(), email: newT.email.trim() })
        onSecret({ studioId: studio.id, email: res.user.email, password: res.temporaryPassword, reason: `${res.user.name} agregado a «${studio.name}».` })
        setNewT({ name: '', email: '' })
        setAdding(false)
      },
      'No pudimos agregar el tatuador.',
    )
  }

  return (
    <li className={`adm-studio${studio.active ? '' : ' is-off'}`}>
      <div className="adm-studio__head">
        <div>
          <h3 className="adm-studio__name">{studio.name}</h3>
          <p className="adm-studio__meta">
            {studio.email} · desde {formatDate(studio.created_at)}
          </p>
        </div>
        <span className={`st-badge ${studio.active ? 'adm-ok' : 'adm-off'}`}>
          {studio.active ? 'Activo' : 'Desactivado'}
        </span>
      </div>

      <p className="adm-studio__stats">
        {studio.sessions_total} sesiones · {studio.upcoming_appointments} citas por venir · {studio.sketches_total}{' '}
        bocetos · {studio.clients_total} clientes
        {studio.last_activity_at ? ` · última actividad ${formatDate(studio.last_activity_at)}` : ' · sin actividad'}
      </p>

      <div className="adm-studio__controls">
        <label className="adm-plan">
          <span>Plan</span>
          <select
            className="st-input st-input--sm"
            value={studio.plan}
            disabled={busy !== null}
            onChange={(e) =>
              act(`plan-${studio.id}`, async () => void (await updateAdminStudio(studio.id, { plan: e.target.value as AdminStudio['plan'] })), 'No pudimos cambiar el plan.')
            }
          >
            {PLANS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className={`st-btn st-btn--sm${studio.active ? ' st-btn--danger' : ''}`}
          disabled={busy !== null}
          onClick={toggleStudio}
        >
          {studio.active ? 'Desactivar estudio' : 'Reactivar estudio'}
        </button>
      </div>

      <ul className="adm-people" aria-label={`Tatuadores de ${studio.name}`}>
        {studio.tattooists.map((t) => (
          <li key={t.id} className={`adm-person${t.active ? '' : ' is-off'}`}>
            <span className="adm-person__main">
              <span className="adm-person__name">
                {t.name}
                {t.role === 'admin' && <span className="st-badge adm-role">Admin</span>}
                {t.is_owner && <span className="st-badge">Dueño</span>}
                {!t.active && <span className="st-badge adm-off">Desactivado</span>}
              </span>
              <span className="adm-person__mail">{t.email}</span>
            </span>
            <span className="adm-person__actions">
              {!t.is_owner && studio.tattooists.length > 1 && (
                <button type="button" className="st-btn st-btn--sm" disabled={busy !== null} onClick={() => makeOwner(t)}>
                  Hacer dueño
                </button>
              )}
              <button type="button" className="st-btn st-btn--sm" disabled={busy !== null} onClick={() => resetPassword(t)}>
                Restablecer contraseña
              </button>
              {t.id !== myId && (
                <button
                  type="button"
                  className={`st-btn st-btn--sm${t.active ? ' st-btn--danger' : ''}`}
                  disabled={busy !== null}
                  onClick={() => toggleUser(t)}
                >
                  {t.active ? 'Desactivar' : 'Reactivar'}
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>

      {adding ? (
        <form className="adm-add" onSubmit={addTattooist} noValidate>
          <input
            className="st-input st-input--sm"
            placeholder="Nombre"
            aria-label="Nombre del tatuador"
            value={newT.name}
            onChange={(e) => setNewT({ ...newT, name: e.target.value })}
          />
          <input
            className="st-input st-input--sm"
            type="email"
            placeholder="correo@estudio.cl"
            aria-label="Correo del tatuador"
            value={newT.email}
            onChange={(e) => setNewT({ ...newT, email: e.target.value })}
          />
          <button className="st-btn st-btn--sm st-btn--primary" type="submit" disabled={busy !== null || !newT.name.trim() || !newT.email.trim()}>
            Agregar
          </button>
          <button className="st-btn st-btn--sm" type="button" onClick={() => setAdding(false)}>
            Cancelar
          </button>
        </form>
      ) : (
        <button type="button" className="adm-link" onClick={() => setAdding(true)}>
          + Agregar tatuador
        </button>
      )}
    </li>
  )
}
