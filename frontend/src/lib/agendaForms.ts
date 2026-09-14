import {
  formatAmountInput,
  parseCLP,
  type Client,
  type ClientInput,
  type ProjectSession,
  type SessionInput,
} from './agenda'
import { isoLocal, localInputsToIso, timeLocal } from './dates'

/**
 * Estado de los formularios de la agenda y su conversión desde/hacia la API.
 * Los inputs trabajan con texto (montos con puntos, fecha y hora separadas);
 * la API con números e instantes ISO.
 */

/* ---------------- Cliente ---------------- */

export interface ClientFormValue {
  name: string
  phone: string
  email: string
  instagram: string
  notes: string
}

export const EMPTY_CLIENT_FORM: ClientFormValue = {
  name: '',
  phone: '',
  email: '',
  instagram: '',
  notes: '',
}

export const clientToForm = (c: Client): ClientFormValue => ({
  name: c.name,
  phone: c.phone ?? '',
  email: c.email ?? '',
  instagram: c.instagram ? `@${c.instagram}` : '',
  notes: c.notes ?? '',
})

/** Campos vacíos → null, para que un PATCH también sirva para borrarlos. */
export const formToClientInput = (v: ClientFormValue): ClientInput => ({
  name: v.name.trim(),
  phone: v.phone.trim() || null,
  email: v.email.trim() || null,
  instagram: v.instagram.trim() || null,
  notes: v.notes.trim() || null,
})

/* ---------------- Sesión ---------------- */

export interface SessionFormValue {
  /** 'YYYY-MM-DD' local */
  date: string
  /** 'HH:MM' local */
  time: string
  duration: number
  /** Monto como se escribe: "150.000" */
  price: string
  notes: string
}

export const newSessionForm = (date = isoLocal(new Date())): SessionFormValue => ({
  date,
  time: '11:00',
  duration: 120,
  price: '',
  notes: '',
})

export const sessionToForm = (s: ProjectSession): SessionFormValue => {
  const start = new Date(s.starts_at)
  return {
    date: isoLocal(start),
    time: timeLocal(start),
    duration: s.duration_minutes,
    price: formatAmountInput(s.price),
    notes: s.notes ?? '',
  }
}

export const formToSessionInput = (v: SessionFormValue): SessionInput => ({
  startsAt: localInputsToIso(v.date, v.time),
  durationMinutes: v.duration,
  price: parseCLP(v.price),
  notes: v.notes.trim() || null,
})
