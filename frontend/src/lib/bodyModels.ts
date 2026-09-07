/**
 * Catálogo de cuerpos para la previsualización 3D.
 *
 * Hay 14 modelos: dos sexos × siete piezas (cuerpo completo, torso, los dos
 * brazos, las dos piernas y la cabeza). **Cada pieza es un modelo suelto**, no
 * un recorte del cuerpo: los originales salieron de Blender cada uno con su
 * transform, así que no encajan entre sí. El visor centra y escala lo que
 * carga, de modo que elegir "Brazo izquierdo" muestra ese brazo llenando la
 * vista.
 *
 * Convención de los modelos: un solo `Mesh` con un solo material, **sin
 * esqueleto**, Y arriba. El visor lo centra y lo escala a `targetHeight`, así
 * que el modelo puede venir en cualquier tamaño; lo que sí importa es la
 * orientación.
 *
 * Formatos aceptados por `file`: **`.glb`** (recomendado) y **`.obj`** (se
 * carga pero pesa mucho más). El `.mtl` que acompaña al `.obj` se ignora — la
 * piel la pone el visor. Los archivos servidos van en `frontend/public/models/`
 * y llevan sufijo de versión (`-v1`) porque nginx los sirve con
 * `Cache-Control: immutable` a un año (ver `frontend/nginx.conf`): cambiar un
 * modelo obliga a cambiar el nombre, o quien ya lo tenga no verá el nuevo.
 *
 * Los originales sin optimizar viven en `models-src/` (fuera del repo). Para
 * regenerar los `.glb`:  `npm run models`  (ver `scripts/build-models.mjs`).
 */

export type Sex = 'hombre' | 'mujer'

export type PartId =
  | 'cuerpo'
  | 'torso'
  | 'brazo-izq'
  | 'brazo-der'
  | 'pierna-izq'
  | 'pierna-der'
  | 'cabeza'

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
  /** `${sex}-${part}`, y también el nombre del archivo. */
  id: string
  sex: Sex
  part: PartId
  /** Etiqueta de la pieza ("Torso"); el sexo se elige aparte en la UI. */
  label: string
  /** Ruta bajo /models. Siempre hay archivo: ya no queda maniquí de reserva. */
  file: string
  version: string
  /**
   * Eje "arriba" del archivo. glTF siempre es `y-up`; muchos `.obj` salen de
   * Blender/3ds Max como `z-up` (el cuerpo aparecería tumbado). Por defecto
   * `y-up`.
   */
  orientation?: 'y-up' | 'z-up'
  /**
   * Alto real de la pieza (m) al que la normaliza el visor. Es lo que hace que
   * un tatuaje de 12 cm mida 12 cm tanto en un cuerpo entero como en una
   * cabeza suelta, y que los "cm" de los deslizadores no mientan.
   */
  targetHeight: number
  /** Profundidad por defecto del proyector (m). */
  decalDepth: number
  camera: CameraPreset
  /** Solo el cuerpo completo tiene encuadres; una pieza suelta no. */
  zones: BodyZone[]
}

export const SEXES: { id: Sex; label: string }[] = [
  { id: 'hombre', label: 'Hombre' },
  { id: 'mujer', label: 'Mujer' },
]

export const PART_ORDER: PartId[] = [
  'cuerpo',
  'torso',
  'brazo-izq',
  'brazo-der',
  'pierna-izq',
  'pierna-der',
  'cabeza',
]

export const PART_LABEL: Record<PartId, string> = {
  cuerpo: 'Cuerpo completo',
  torso: 'Torso',
  'brazo-izq': 'Brazo izq.',
  'brazo-der': 'Brazo der.',
  'pierna-izq': 'Pierna izq.',
  'pierna-der': 'Pierna der.',
  cabeza: 'Cabeza',
}

/**
 * Alto real de cada pieza (m). Salen de la escala del juego femenino, que sí
 * es coherente: `Mujer.obj` mide 1.689 unidades y representa 1.75 m, o sea
 * ~1.036 m/unidad; aplicado al bounding box de cada pieza da estas medidas,
 * que son las de un cuerpo humano real. El juego masculino no tiene escala
 * interna fiable (sus piezas no encajan entre sí), así que usa las mismas.
 */
const PART_HEIGHT: Record<PartId, number> = {
  cuerpo: 1.75,
  torso: 0.7,
  'brazo-izq': 0.71,
  'brazo-der': 0.71,
  'pierna-izq': 0.84,
  'pierna-der': 0.84,
  cabeza: 0.26,
}

/** Grosor del proyector de la calca (m): el grosor aproximado del miembro. */
const PART_DEPTH: Record<PartId, number> = {
  cuerpo: 0.3,
  torso: 0.3,
  'brazo-izq': 0.12,
  'brazo-der': 0.12,
  'pierna-izq': 0.18,
  'pierna-der': 0.18,
  cabeza: 0.22,
}

/**
 * Encuadre que llena la vista con una pieza de alto `h` centrada en X/Z y
 * apoyada en y=0. Con el FOV vertical de 45° del visor, encajar `h` justo
 * pediría (h/2)/tan(22.5°) = 1.207·h; el 1.7 deja aire alrededor para poder
 * orbitar sin que la pieza toque los bordes.
 */
function framing(h: number): CameraPreset {
  return { position: [0, h * 0.5, h * 1.7], target: [0, h * 0.5, 0] }
}

const FULL_BODY_CAMERA: CameraPreset = { position: [0, 1.05, 2.6], target: [0, 0.95, 0] }

/**
 * Las 7 zonas del cuerpo completo. Las X van multiplicadas por `spread`, la
 * envergadura del modelo ya normalizado relativa a la del hombre. Sin eso, el
 * encuadre de "brazo izquierdo" de la mujer apuntaría fuera del cuerpo: una
 * vez normalizados, el hombre mide 0.94 m de ancho y la mujer 0.77 m, y el
 * target x = 0.42 cae fuera de la silueta femenina.
 */
function fullBodyZones(spread: number): BodyZone[] {
  const x = (v: number) => Number((v * spread).toFixed(3))
  return [
    { id: 'frente', label: 'Frente', decalDepth: 0.3, camera: { position: [0, 1.05, 2.6], target: [0, 0.95, 0] } },
    { id: 'espalda', label: 'Espalda', decalDepth: 0.3, camera: { position: [0, 1.15, -2.4], target: [0, 1.05, 0] } },
    { id: 'pecho', label: 'Pecho', decalDepth: 0.28, camera: { position: [0, 1.3, 1.3], target: [0, 1.28, 0] } },
    { id: 'brazo-izq', label: 'Brazo izquierdo', decalDepth: 0.12, camera: { position: [x(1.15), 1.15, 0.75], target: [x(0.42), 1.1, 0] } },
    { id: 'brazo-der', label: 'Brazo derecho', decalDepth: 0.12, camera: { position: [x(-1.15), 1.15, 0.75], target: [x(-0.42), 1.1, 0] } },
    { id: 'pierna-izq', label: 'Pierna izquierda', decalDepth: 0.18, camera: { position: [x(0.85), 0.5, 1.1], target: [x(0.16), 0.45, 0] } },
    { id: 'pierna-der', label: 'Pierna derecha', decalDepth: 0.18, camera: { position: [x(-0.85), 0.5, 1.1], target: [x(-0.16), 0.45, 0] } },
  ]
}

const SPREAD: Record<Sex, number> = { hombre: 1, mujer: 0.82 }

/** El cuerpo masculino ya estaba exportado con otro nombre; no se reexporta. */
const FILE_OVERRIDE: Record<string, string> = {
  'hombre-cuerpo': '/models/male-v1.glb',
}

export function bodyModelId(sex: Sex, part: PartId): string {
  return `${sex}-${part}`
}

function build(sex: Sex, part: PartId): BodyModel {
  const id = bodyModelId(sex, part)
  const targetHeight = PART_HEIGHT[part]
  const full = part === 'cuerpo'
  return {
    id,
    sex,
    part,
    label: PART_LABEL[part],
    file: FILE_OVERRIDE[id] ?? `/models/${id}-v1.glb`,
    version: '1',
    targetHeight,
    decalDepth: PART_DEPTH[part],
    camera: full ? FULL_BODY_CAMERA : framing(targetHeight),
    zones: full ? fullBodyZones(SPREAD[sex]) : [],
  }
}

export const BODY_MODELS: BodyModel[] = SEXES.flatMap((s) =>
  PART_ORDER.map((p) => build(s.id, p)),
)

export const DEFAULT_MODEL_ID = 'hombre-cuerpo'

export function findBodyModel(id: string): BodyModel | undefined {
  return BODY_MODELS.find((m) => m.id === id)
}

/**
 * Ids del catálogo anterior. `cuerpo` era exactamente este mismo modelo con
 * otro nombre, así que las coordenadas guardadas siguen valiendo. Los otros
 * tres eran el maniquí de primitivas, que ya no existe: se abren sobre el
 * cuerpo masculino, pero los tatuajes caerán donde no toca (ver `isStaleModelId`).
 */
const LEGACY_IDS: Record<string, string> = {
  cuerpo: 'hombre-cuerpo',
  brazo: 'hombre-cuerpo',
  espalda: 'hombre-cuerpo',
  pierna: 'hombre-cuerpo',
}

/** Ids cuyas coordenadas guardadas ya no significan nada (eran del maniquí). */
export function isStaleModelId(id: string): boolean {
  return id === 'brazo' || id === 'espalda' || id === 'pierna'
}

/** Nunca devuelve undefined: la página siempre tiene un cuerpo que mostrar. */
export function resolveBodyModel(id: string): BodyModel {
  return (
    findBodyModel(id) ??
    findBodyModel(LEGACY_IDS[id] ?? '') ??
    findBodyModel(DEFAULT_MODEL_ID)!
  )
}

/** Tamaño por defecto del tatuaje al colocarlo (m). 12 cm de lado. */
export const DEFAULT_TATTOO_SIZE = 0.12
export const MIN_TATTOO_SIZE = 0.02
export const MAX_TATTOO_SIZE = 0.6

/**
 * Tope del deslizador de tamaño para una pieza concreta (m). Sin esto, en una
 * cabeza de 26 cm el tope global de 60 cm daría una caja de proyección más
 * grande que el propio modelo.
 */
export function maxTattooSize(model: BodyModel): number {
  return Math.min(MAX_TATTOO_SIZE, model.targetHeight * 0.8)
}
