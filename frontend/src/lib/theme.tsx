/**
 * Tema claro/oscuro global.
 *
 * Fuente única de verdad para todo el sitio autenticado. Persiste la
 * preferencia en `localStorage` (clave `dash-theme`, compatible con lo que ya
 * había guardado el Dashboard) y la sincroniza entre pestañas del navegador.
 *
 * El atributo `data-theme` en `<html>` lo fija primero un script inline en
 * `index.html` (para que no haya parpadeo al cargar); aquí solo se mantiene
 * sincronizado con el estado de React.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'

type Theme = 'light' | 'dark'

const STORAGE_KEY = 'dash-theme'

function readStored(): Theme {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

interface ThemeContextValue {
  /** `true` si el tema activo es el claro (washi). */
  light: boolean
  /** Alterna entre claro y oscuro. */
  toggle: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(readStored)

  // Refleja el estado en <html data-theme> y en localStorage.
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      /* localStorage no disponible: el tema vive solo en memoria */
    }
  }, [theme])

  // Otra pestaña cambió el tema: reflejarlo aquí.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== STORAGE_KEY) return
      setTheme(e.newValue === 'light' ? 'light' : 'dark')
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const toggle = useCallback(() => {
    setTheme((t) => (t === 'light' ? 'dark' : 'light'))
  }, [])

  return (
    <ThemeContext.Provider value={{ light: theme === 'light', toggle }}>
      {children}
    </ThemeContext.Provider>
  )
}

// El provider y su hook viven juntos a propósito (patrón idiomático de
// contexto). Eso rompe el fast-refresh solo de este archivo, que casi nunca
// se edita; el trade-off vale la pena frente a partir la API en dos módulos.
// eslint-disable-next-line react-refresh/only-export-components
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme debe usarse dentro de <ThemeProvider>')
  return ctx
}
