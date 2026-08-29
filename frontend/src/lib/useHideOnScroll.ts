import { useEffect, useState } from 'react'

/**
 * Header auto-oculto.
 *
 * Devuelve `true` cuando el header debería estar escondido. Se esconde al
 * scrollear hacia abajo y reaparece al scrollear hacia arriba, al volver al
 * tope de la página, o al acercar el puntero al borde superior de la ventana.
 *
 * Con `prefers-reduced-motion: reduce` nunca se esconde.
 *
 * @param revealZone  franja (px) desde el borde superior que cuenta como
 *                     "puntero arriba", y umbral de scroll bajo el cual el
 *                     header siempre se muestra.
 */
export function useHideOnScroll(revealZone = 72): boolean {
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let lastY = window.scrollY
    let pointerAtTop = false
    let raf = 0

    const evaluate = () => {
      raf = 0
      const y = window.scrollY
      const delta = y - lastY
      // Ignora micro-temblores de scroll.
      if (Math.abs(delta) < 4 && y > 8) return
      lastY = y

      if (pointerAtTop || y <= 8) setHidden(false)
      else if (delta > 0 && y > revealZone) setHidden(true)
      else if (delta < 0) setHidden(false)
    }

    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(evaluate)
    }
    const onPointerMove = (e: PointerEvent) => {
      const near = e.clientY <= revealZone
      if (near !== pointerAtTop) {
        pointerAtTop = near
        schedule()
      }
    }

    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('pointermove', onPointerMove, { passive: true })
    return () => {
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('pointermove', onPointerMove)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [revealZone])

  return hidden
}
