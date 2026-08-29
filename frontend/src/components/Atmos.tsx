import { useEffect, useRef } from 'react'
import { useTheme } from '../lib/theme'
import './Atmos.css'

/**
 * Fondo de nubes ("atmósfera") compartido por todas las páginas de la app.
 *
 * Arco fijo abajo-derecha, recortado con máscara radial. El tratamiento
 * (filtro) es el mismo en claro y oscuro; solo cambia la imagen.
 *
 * Al bajar por la página la imagen se revela: un listener de scroll (con
 * throttle por rAF) escribe el progreso 0→1 en `--atmos-p`, y el CSS lo
 * traduce a opacidad. Cada página lo renderiza una vez en su raíz.
 */
export default function Atmos() {
  const { light } = useTheme()
  const ref = useRef<HTMLDivElement>(null)
  const src = light ? '/japanese-atmos-v2.webp' : '/clouds-atmos-v2.webp'

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let raf = 0
    const update = () => {
      raf = 0
      // Se revela del todo tras ~65vh de scroll.
      const max = window.innerHeight * 0.65
      const p = max > 0 ? Math.min(1, window.scrollY / max) : 0
      el.style.setProperty('--atmos-p', String(p))
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }

    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <div className="atmos" ref={ref} aria-hidden="true">
      <img
        className="atmos__img"
        src={src}
        alt=""
        width={800}
        height={1422}
        fetchPriority="high"
      />
    </div>
  )
}
