import { useTheme } from '../lib/theme'

const sun = (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <circle cx="12" cy="12" r="4.2" />
    <path
      d="M12 2.5v2.6M12 18.9v2.6M4.6 4.6l1.9 1.9M17.5 17.5l1.9 1.9M2.5 12h2.6M18.9 12h2.6M4.6 19.4l1.9-1.9M17.5 6.5l1.9-1.9"
      strokeLinecap="round"
    />
  </svg>
)

const moon = (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <path d="M20 14.5A8 8 0 019.5 4a7 7 0 100 14 8 8 0 0010.5-3.5z" strokeLinejoin="round" />
  </svg>
)

/**
 * Botón claro/oscuro. No trae estilos propios: cada página le pasa su
 * `className` para posicionarlo y estilarlo (p. ej. `dash__iconbtn`).
 */
export default function ThemeToggle({ className }: { className?: string }) {
  const { light, toggle } = useTheme()

  return (
    <button
      type="button"
      className={className}
      onClick={toggle}
      aria-pressed={light}
      aria-label={light ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro'}
      title={light ? 'Modo oscuro' : 'Modo claro'}
    >
      {light ? moon : sun}
    </button>
  )
}
