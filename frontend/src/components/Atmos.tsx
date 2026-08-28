import { useTheme } from '../lib/theme'
import './Atmos.css'

/**
 * Fondo de nubes ("atmósfera") compartido por todas las páginas de la app.
 *
 * Arco fijo abajo-derecha, recortado con máscara radial. El tratamiento
 * (opacidad, filtro) es el mismo en claro y oscuro; solo cambia la imagen.
 * Cada página lo renderiza una vez dentro de su contenedor raíz.
 */
export default function Atmos() {
  const { light } = useTheme()
  const src = light ? '/japanese-atmos-v2.webp' : '/clouds-atmos-v2.webp'

  return (
    <div className="atmos" aria-hidden="true">
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
