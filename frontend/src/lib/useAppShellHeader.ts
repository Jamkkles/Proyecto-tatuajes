import { useEffect } from 'react'
import { useOutletContext } from 'react-router-dom'

/**
 * Título opcional que una página muestra en la barra superior compartida
 * (`<AppShell>`). El Dashboard lo deja vacío; la Galería pone su nombre y el
 * contador de bocetos.
 */
export interface AppHeader {
  title?: string
  subtitle?: string
}

interface AppShellOutletContext {
  setHeader: (header: AppHeader) => void
}

/**
 * Declara el contenido de la barra superior para la vista actual. Cada página
 * bajo el layout `<AppShell>` debe llamarlo (aunque sea con `{}`), así al
 * navegar la barra siempre refleja la vista montada.
 */
export function useAppShellHeader({ title, subtitle }: AppHeader) {
  const { setHeader } = useOutletContext<AppShellOutletContext>()
  useEffect(() => {
    setHeader({ title, subtitle })
  }, [setHeader, title, subtitle])
}
