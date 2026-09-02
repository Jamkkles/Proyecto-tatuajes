/**
 * Catálogo de cuerpos para la previsualización 3D.
 *
 * Convención de los modelos (ver el plan del módulo): un solo `Mesh` con un
 * solo material, **sin esqueleto**, Y arriba, con los pies hacia y=0. El visor
 * lo centra y lo escala a estatura estándar, así que el modelo puede venir en
 * cualquier tamaño; lo que sí importa es la orientación.
 *
 * Formatos aceptados por `file`: **`.glb`** (recomendado: comprimido, con
 * materiales) y **`.obj`** (se carga pero pesa mucho más; conviene convertirlo
 * a `.glb`). El `.mtl` que acompaña al `.obj` se ignora — la piel la pone el
 * visor. Los archivos servidos van en `frontend/public/models/` y llevan
 * sufijo de versión (`-v1`) porque el service worker cachea sin invalidar:
 * cambiar el modelo obliga a cambiar el nombre.
 *
 * Los originales sin optimizar viven en `models-src/` (fuera del repo). El
 * pipeline para preparar uno nuevo (objetivo: ~40-80k triángulos, ≤ 2 MB):
 *   npx obj2gltf -i models-src/x.obj -o /tmp/x.glb
 *   npx @gltf-transform/cli join /tmp/x.glb /tmp/x-j.glb
 *   npx @gltf-transform/cli weld /tmp/x-j.glb /tmp/x-w.glb
 *   npx @gltf-transform/cli simplify /tmp/x-w.glb /tmp/x-s.glb --ratio 0.045 --error 0.015
 *   npx @gltf-transform/cli optimize /tmp/x-s.glb frontend/public/models/x-v1.glb \
 *       --compress false --texture-compress false --simplify false
 * (NO usar `--compress meshopt`: cuantiza POSITION y el visor lee la escala mal;
 *  nginx ya sirve el .glb con gzip.)
 *
 * `file: null` usa el maniquí de primitivas que arma el propio visor, para
 * poder trabajar (y probar el guardado) antes de tener los modelos reales.
 */

export interface CameraPreset {
  position: [number, number, number]
  target: [number, number, number]
}

export interface BodyZone {
  id: string
  label: string
  camera: CameraPreset
  /**
   * Profundidad del proyector de la calca (m) para esta zona: aproximadamente
   * el grosor del miembro. Poca → el tatuaje se corta; mucha → atraviesa y
   * aparece también por el otro lado.
   */
  decalDepth: number
}

export interface BodyModel {
  id: string
  label: string
  /** Ruta bajo /models (`.glb` o `.obj`), o null para el maniquí de primitivas. */
  file: string | null
  version: string
  /**
   * Eje "arriba" del archivo. glTF siempre es `y-up`; muchos `.obj` salen de
   * Blender/3ds Max como `z-up` (el cuerpo aparecería tumbado). Por defecto
   * `y-up`.
   */
  orientation?: 'y-up' | 'z-up'
  /** Profundidad por defecto del proyector (m). */
  decalDepth: number
  camera: CameraPreset
  zones: BodyZone[]
}

export const BODY_MODELS: BodyModel[] = [
  {
    id: 'cuerpo',
    label: 'Cuerpo completo',
    file: '/models/male-v1.glb', // ZBrush → obj2gltf → gltf-transform simplify (~63k tris)
    version: '1',
    decalDepth: 0.3,
    camera: { position: [0, 1.05, 2.6], target: [0, 0.95, 0] },
    zones: [
      { id: 'frente', label: 'Frente', decalDepth: 0.3, camera: { position: [0, 1.05, 2.6], target: [0, 0.95, 0] } },
      { id: 'espalda', label: 'Espalda', decalDepth: 0.3, camera: { position: [0, 1.15, -2.4], target: [0, 1.05, 0] } },
      { id: 'pecho', label: 'Pecho', decalDepth: 0.28, camera: { position: [0, 1.3, 1.3], target: [0, 1.28, 0] } },
      { id: 'brazo-izq', label: 'Brazo izquierdo', decalDepth: 0.12, camera: { position: [1.15, 1.15, 0.75], target: [0.42, 1.1, 0] } },
      { id: 'brazo-der', label: 'Brazo derecho', decalDepth: 0.12, camera: { position: [-1.15, 1.15, 0.75], target: [-0.42, 1.1, 0] } },
      { id: 'pierna-izq', label: 'Pierna izquierda', decalDepth: 0.18, camera: { position: [0.85, 0.5, 1.1], target: [0.16, 0.45, 0] } },
      { id: 'pierna-der', label: 'Pierna derecha', decalDepth: 0.18, camera: { position: [-0.85, 0.5, 1.1], target: [-0.16, 0.45, 0] } },
    ],
  },
  {
    id: 'brazo',
    label: 'Brazo',
    file: null, // → '/models/brazo-v1.obj' (o .glb)
    version: '1',
    decalDepth: 0.12,
    camera: { position: [0.6, 1.1, 0.9], target: [0.4, 1.05, 0] },
    zones: [],
  },
  {
    id: 'espalda',
    label: 'Espalda',
    file: null, // → '/models/espalda-v1.obj' (o .glb)
    version: '1',
    decalDepth: 0.3,
    camera: { position: [0, 1.15, -2.2], target: [0, 1.05, 0] },
    zones: [],
  },
  {
    id: 'pierna',
    label: 'Pierna',
    file: null, // → '/models/pierna-v1.obj' (o .glb)
    version: '1',
    decalDepth: 0.18,
    camera: { position: [0.7, 0.5, 1.2], target: [0.16, 0.45, 0] },
    zones: [],
  },
]

export function findBodyModel(id: string): BodyModel | undefined {
  return BODY_MODELS.find((m) => m.id === id)
}

/** Tamaño por defecto del tatuaje al colocarlo (m). 12 cm de lado. */
export const DEFAULT_TATTOO_SIZE = 0.12
export const MIN_TATTOO_SIZE = 0.02
export const MAX_TATTOO_SIZE = 0.6
