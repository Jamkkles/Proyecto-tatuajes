import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js'
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { BodyModel, CameraPreset } from './bodyModels'

/**
 * Motor del módulo de previsualización 3D. three.js puro, sin React dentro:
 * la página lo instancia en un `useEffect` y habla con él por esta API.
 *
 * El tatuaje se pega con `DecalGeometry`: se proyecta una caja orientada según
 * la normal de la superficie y se recortan los triángulos del cuerpo que caen
 * dentro. Mover o escalar obliga a **reconstruir** la geometría, así que las
 * actualizaciones se agrupan en un único rebuild por fotograma.
 *
 * El cuerpo se normaliza al cargarse (centrado, escalado al `targetHeight` del
 * modelo y con la transformación horneada en la geometría), de modo que el
 * objeto queda en la identidad y el espacio del mundo coincide con el del
 * modelo. Gracias a eso las coordenadas que se guardan en la base de datos son
 * estables, y un tatuaje de 12 cm mide 12 cm tanto en un cuerpo entero como en
 * una pieza suelta.
 */

/** Píxeles de desplazamiento por debajo de los cuales un arrastre es un clic. */
const CLICK_SLOP = 5
/** Un dedo tiembla más que un ratón: un toque admite más holgura para ser clic. */
const TAP_SLOP = 12

/**
 * Giro de los dos dedos que se ignora antes de empezar a rotar la calca (rad).
 * Al pellizcar para cambiar el tamaño los dedos nunca se mueven perfectamente
 * en línea; sin esta holgura el tatuaje se torcía un poco cada vez que se
 * agrandaba.
 */
const TWIST_DEADZONE = (6 * Math.PI) / 180

/**
 * Con dos dedos, cuánto más allá de su borde se puede tocar una calca elegida
 * para que el gesto sea suyo y no de la cámara (en radios de la calca). Un
 * tatuaje de 5 cm no deja sitio para apoyar dos dedos encima.
 */
const PINCH_REACH = 2

/** Hasta cuántas veces la distancia del encuadre de partida deja alejar el pellizco. */
const PINCH_MAX_ZOOM_OUT = 1.5

/** Cada cuánto se le cuenta a la página cómo va el gesto (ms). */
const GESTURE_EMIT_MS = 80

/**
 * Cuánto tiene que mirar un triángulo hacia el proyector para conservarse.
 *
 * Medido sobre un cilindro de 12 cm (un brazo), con una calca que llega justo
 * a ese diámetro:
 *
 *   0,30 → envuelve 75°     0,08 → envuelve 86°
 *   0,20 → envuelve 79°     0,02 → envuelve 90°, el máximo geométrico
 *
 * Subirlo recorta el envolvente, que es justo lo que no se quiere: envolver un
 * brazo ES acercarse a la silueta. Se deja en 0,02, lo mínimo para descartar
 * las astillas exactamente tangentes sin perder ni un grado útil. Con ese valor
 * se siguen descartando ~300 triángulos de la cara opuesta.
 */
const MIN_FACING = 0.02

/**
 * Eje del proyector en espacio local. `orientationFor` usa `lookAt`, que deja
 * el +Z del objeto sobre la normal de la superficie, de modo que girarlo por el
 * cuaternión de la calca devuelve hacia dónde mira.
 */
const FORWARD = new THREE.Vector3(0, 0, 1)

/**
 * Margen de la caja del proyector sobre el grosor del miembro.
 *
 * No agranda el envolvente: medido sobre un cilindro, la calca llega a los
 * mismos 90° con 12, 19 o 36 cm de profundidad, porque quien manda es el ancho
 * y no el fondo. El margen solo cubre los casos en que el punto de colocación
 * no cae en la parte más cercana de la pieza y la caja justa se quedaría corta.
 *
 * Lo que sí hacía la profundidad era provocar la duplicación: con 30 cm en un
 * brazo de 12 la caja atravesaba y recortaba también la cara de atrás (180° de
 * envolvente). Por eso dejó de ser un control y el recorte por normales lo
 * cubre aunque una escena vieja traiga un valor grande.
 */
const PROJECTOR_REACH = 1.25

/** Ejes locales de la calca: X es su ancho, Y su alto. */
const RIGHT = new THREE.Vector3(1, 0, 0)
const UP = new THREE.Vector3(0, 1, 0)

/** Desde cuán lejos se lanza el rayo de medición (m), por delante de la piel. */
const PROBE_STANDOFF = 1

/**
 * A partir de este arco se envuelve. Por debajo, la proyección plana de siempre
 * da el mismo resultado sin dar rodeos.
 */
const MIN_WRAP_ANGLE = (40 * Math.PI) / 180

/** Margen de la caja sobre el diámetro, para que el anillo entre entero. */
const RING_MARGIN = 1.08

/**
 * Cuánto puede alejarse un punto del cilindro que se viene siguiendo antes de
 * considerar que ya es otra parte del cuerpo y no este miembro.
 *
 * Un brazo no es un cilindro perfecto: se afina hacia la muñeca y tiene
 * relieve, así que el radio real varía bastante a lo largo del tatuaje. Con
 * poca tolerancia el envolvente se cortaba a los pocos grados; con 1 se admite
 * cualquier punto entre el eje y el doble del radio, que sigue dejando fuera
 * el torso o el otro brazo.
 */
const RING_TOLERANCE = 1

/**
 * Vanos con que se tantea la curvatura, de mayor a menor (m).
 *
 * Con poco vano el facetado de la malla domina la medida, así que se empieza
 * ancho. Pero en un miembro delgado un vano ancho se sale de la piel y no
 * devuelve nada —en una muñeca de 2,6 cm de radio, medir a 3 cm de distancia ya
 * cae al aire—, de ahí que se vaya cerrando hasta encontrar uno que quepa.
 */
const CURVATURE_SPANS = [0.03, 0.018, 0.01, 0.006]

/** Por encima de este radio la piel se considera plana (m). */
const MAX_CURVE_RADIUS = 0.5

/**
 * Margen del recorte de malla sobre lo que ocupa la calca (m). Es lo que
 * permite arrastrarla un trecho sin tener que rehacerlo.
 */
const PATCH_SLACK = 0.05

/**
 * Coseno del giro de la piel tras el cual se vuelve a anclar el origen del
 * arrastre. 0 = un cuarto de vuelta.
 */
const REANCHOR_DOT = 0

/**
 * Fracción de la malla por encima de la cual el recorte deja de compensar: si
 * se queda con casi todo, cuesta lo mismo proyectar sobre el cuerpo entero.
 */
const PATCH_WORTH_IT = 0.6

/**
 * Cuánto puede moverse una calca antes de volver a medir la curvatura (m).
 *
 * Un centímetro basta: a esa escala la piel sigue siendo la misma. Remedir en
 * cada fotograma hacía temblar el dibujo y frenaba el arrastre.
 */
const REMEASURE_DISTANCE = 0.01


/**
 * Se queda solo con los triángulos que dan la cara al proyector.
 *
 * `DecalGeometry` recorta por la caja, pero la caja es un volumen: en un brazo
 * entra por delante y sale por detrás, y la calca aparecía pegada en los dos
 * lados. Se compara la normal de cada triángulo con la dirección del proyector
 * y se descartan las que miran al revés.
 *
 * Las normales vienen de la malla del cuerpo, que es suave, así que promediar
 * las de los tres vértices da mejor resultado que calcular la del plano: en una
 * superficie curva el promedio sigue la curvatura y no el facetado.
 *
 * Si no sobrevive nada se devuelve la geometría original: más vale un tatuaje
 * mal recortado que uno invisible.
 */
function cullAwayFacing(
  geometry: THREE.BufferGeometry,
  forward: THREE.Vector3,
): THREE.BufferGeometry {
  const position = geometry.getAttribute('position')
  const normal = geometry.getAttribute('normal')
  const uv = geometry.getAttribute('uv')
  if (!position || !normal) return geometry

  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  const average = new THREE.Vector3()

  for (let tri = 0; tri + 2 < position.count; tri += 3) {
    average.set(0, 0, 0)
    for (let v = 0; v < 3; v++) {
      average.x += normal.getX(tri + v)
      average.y += normal.getY(tri + v)
      average.z += normal.getZ(tri + v)
    }
    if (average.lengthSq() === 0) continue
    if (average.normalize().dot(forward) < MIN_FACING) continue

    for (let v = 0; v < 3; v++) {
      positions.push(position.getX(tri + v), position.getY(tri + v), position.getZ(tri + v))
      normals.push(normal.getX(tri + v), normal.getY(tri + v), normal.getZ(tri + v))
      if (uv) uvs.push(uv.getX(tri + v), uv.getY(tri + v))
    }
  }

  if (positions.length === 0) return geometry

  const culled = new THREE.BufferGeometry()
  culled.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  culled.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  if (uvs.length) culled.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.dispose()
  return culled
}

/**
 * Recorta la malla del cuerpo a los triángulos que rodean un punto.
 *
 * `DecalGeometry` recorre la malla entera cada vez que se reconstruye una
 * calca. Sobre el brazo del proyecto (40.000 triángulos) eso son 41 ms, o sea
 * 24 fps mientras se arrastra; sobre la vecindad del tatuaje baja a 18 ms.
 */
function localPatch(mesh: THREE.Mesh, center: THREE.Vector3, radius: number): THREE.Mesh | null {
  const source = mesh.geometry
  const position = source.getAttribute('position')
  const normal = source.getAttribute('normal')
  // Se leen los búferes en crudo, así que hay que descartar los entrelazados y
  // los que no sean de tres componentes. Estas mallas no lo son, pero el visor
  // carga archivos de fuera.
  if (!(position instanceof THREE.BufferAttribute)) return null
  if (!(normal instanceof THREE.BufferAttribute)) return null
  if (position.itemSize !== 3 || normal.itemSize !== 3) return null

  const index = source.getIndex()
  const pos = position.array
  const nor = normal.array
  const idx = index?.array
  const triangles = Math.floor((index ? index.count : position.count) / 3)
  if (triangles === 0) return null

  const cx = center.x
  const cy = center.y
  const cz = center.z
  const radiusSq = radius * radius

  // Dos pasadas sobre búferes tipados en lugar de ir empujando a un array
  // normal: lo de antes costaba 212 ms sobre el brazo de 40.000 triángulos, un
  // tirón de los que se ven, justo en el fotograma en que se agarra la calca.
  // Primero se anotan los triángulos que entran, luego se copian de una vez.
  const keep = new Uint32Array(triangles)
  let kept = 0
  for (let t = 0; t < triangles; t++) {
    const base = t * 3
    for (let v = 0; v < 3; v++) {
      const i = (idx ? idx[base + v] : base + v) * 3
      const dx = pos[i] - cx
      const dy = pos[i + 1] - cy
      const dz = pos[i + 2] - cz
      if (dx * dx + dy * dy + dz * dz <= radiusSq) {
        keep[kept++] = t
        break
      }
    }
  }
  // Si se queda con casi toda la malla no hay nada que ganar: se proyecta
  // sobre el cuerpo entero y se ahorra el recorte y su memoria.
  if (kept === 0 || kept > triangles * PATCH_WORTH_IT) return null

  const positions = new Float32Array(kept * 9)
  const normals = new Float32Array(kept * 9)
  for (let k = 0; k < kept; k++) {
    const base = keep[k] * 3
    for (let v = 0; v < 3; v++) {
      const i = (idx ? idx[base + v] : base + v) * 3
      const o = k * 9 + v * 3
      positions[o] = pos[i]
      positions[o + 1] = pos[i + 1]
      positions[o + 2] = pos[i + 2]
      normals[o] = nor[i]
      normals[o + 1] = nor[i + 1]
      normals[o + 2] = nor[i + 2]
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  const patch = new THREE.Mesh(geometry, mesh.material)
  patch.updateMatrixWorld()
  return patch
}

/**
 * Reparte la imagen por **ángulo alrededor del eje del miembro** en vez de por
 * distancia en plano.
 *
 * Es el cambio que hace que el tatuaje rodee el brazo. Una proyección plana
 * reparte la textura según la sombra del dibujo: al acercarse al borde del
 * miembro la piel se va de canto, la sombra deja de avanzar y la imagen se
 * agolpa hasta cortarse. Midiendo el ángulo, en cambio, se avanza a paso
 * constante sobre la piel y se puede seguir dando la vuelta.
 *
 * De paso hace el recorte: lo que queda fuera del arco del dibujo, o lejos del
 * cilindro que se viene siguiendo (ya es otra parte del cuerpo), se descarta.
 */
function wrapUv(
  geometry: THREE.BufferGeometry,
  frame: {
    center: THREE.Vector3
    spin: THREE.Vector3
    forward: THREE.Vector3
    axis: THREE.Vector3
    radius: number
    arc: number
    across: number
    wrapX: boolean
  },
): THREE.BufferGeometry | null {
  const position = geometry.getAttribute('position')
  const normal = geometry.getAttribute('normal')
  if (!position || !normal) return geometry

  const { center, spin, forward, axis, radius, arc, across, wrapX } = frame
  // Eje perpendicular a la normal dentro del plano del giro: con él y la normal
  // se lee el ángulo de cada punto alrededor del miembro.
  const sideways = new THREE.Vector3().crossVectors(spin, forward).normalize()

  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  const point = new THREE.Vector3()
  const radial = new THREE.Vector3()

  // Un vértice cuenta si está dentro del arco del dibujo, dentro de su alto y
  // pegado al cilindro. Se evalúa por triángulo: o entran los tres o ninguno.
  const sample = (i: number) => {
    point.set(position.getX(i), position.getY(i), position.getZ(i)).sub(center)
    const along = point.dot(spin)
    radial.copy(point).addScaledVector(spin, -along)

    const distance = radial.length()
    if (Math.abs(distance - radius) > radius * RING_TOLERANCE) return null

    const angle = Math.atan2(radial.dot(sideways), radial.dot(forward))
    if (Math.abs(angle) > arc / 2) return null
    if (Math.abs(along) > across / 2) return null

    // El ángulo da la coordenada que envuelve; la del eje, la otra.
    const wrapped = 0.5 + angle / arc
    const straight = 0.5 + (along / across) * (axis.dot(spin) >= 0 ? 1 : -1)
    return wrapX ? { u: wrapped, v: straight } : { u: straight, v: wrapped }
  }

  for (let t = 0; t + 2 < position.count; t += 3) {
    const a = sample(t)
    const b = sample(t + 1)
    const c = sample(t + 2)
    if (!a || !b || !c) continue
    // Un triángulo que cruza la costura (de +180° a −180°) se vería como una
    // banda estirada de lado a lado; se descarta, que son dos triángulos.
    if (Math.abs(a.u - b.u) > 0.5 || Math.abs(b.u - c.u) > 0.5) continue

    for (const [offset, uv] of [
      [0, a],
      [1, b],
      [2, c],
    ] as const) {
      const i = t + offset
      positions.push(position.getX(i), position.getY(i), position.getZ(i))
      normals.push(normal.getX(i), normal.getY(i), normal.getZ(i))
      uvs.push(uv.u, uv.v)
    }
  }

  geometry.dispose()
  if (positions.length === 0) return null

  const wrapped = new THREE.BufferGeometry()
  wrapped.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  wrapped.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  wrapped.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  return wrapped
}

/**
 * Normal de la piel en el punto tocado, interpolada entre los vértices.
 *
 * `hit.normal` la trae ya suavizada; `hit.face.normal` es la de la cara plana y
 * hacía que la calca saltara de un triángulo a otro al arrastrarla sobre un
 * brazo de pocos polígonos. Se cae a la de la cara solo si la malla no trae
 * normales, que no es el caso de estos modelos.
 */
function smoothNormal(hit: THREE.Intersection, mesh: THREE.Mesh): THREE.Vector3 | null {
  const source = hit.normal ?? hit.face?.normal
  if (!source) return null
  return source
    .clone()
    .applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld))
    .normalize()
}

export interface HitInfo {
  point: [number, number, number]
  normal: [number, number, number]
  faceIndex: number
  uv: [number, number] | null
}

export interface PlacementInput {
  id: string
  textureUrl: string
  position: [number, number, number]
  quaternion: [number, number, number, number]
  size: [number, number, number]
}

export interface PlacementTransform {
  position: [number, number, number]
  quaternion: [number, number, number, number]
  size: [number, number, number]
  /**
   * Cuánto giró la calca sobre su plano desde el aviso anterior (rad, positivo
   * en sentido antihorario visto de frente). Solo viene en el gesto de dos
   * dedos; la página lo suma al ángulo que muestra el deslizador.
   */
  rollDelta?: number
}

/** Gesto de dos dedos en curso: sobre una calca o sobre la cámara. */
type Gesture =
  | {
      kind: 'decal'
      entry: DecalEntry
      /** Separación y ángulo de los dedos al empezar. */
      distance: number
      lastAngle: number
      /** Giro acumulado de los dedos (sin la holgura) y lo ya avisado. */
      twist: number
      rollSent: number
      size: THREE.Vector3
      quaternion: THREE.Quaternion
      lastEmit: number
    }
  | {
      kind: 'camera'
      distance: number
      /** Cámara y objetivo al empezar, y a qué distancia estaban. */
      target: THREE.Vector3
      direction: THREE.Vector3
      range: number
      /** Punto del cuerpo bajo los dedos: hacia ahí se acerca. */
      anchor: THREE.Vector3 | null
    }

export interface ViewerCallbacks {
  /** Clic sobre el cuerpo en un punto libre. */
  onPlace?: (hit: HitInfo) => void
  /** Cambia el tatuaje seleccionado (null = ninguno). */
  onSelect?: (id: string | null) => void
  /** El usuario arrastró un tatuaje por la superficie. */
  onTransform?: (id: string, transform: PlacementTransform) => void
  onModelLoaded?: (info: { triangles: number }) => void
  onError?: (message: string) => void
}

interface DecalEntry {
  id: string
  mesh: THREE.Mesh
  material: THREE.MeshStandardMaterial
  texture: THREE.Texture
  position: THREE.Vector3
  quaternion: THREE.Quaternion
  size: THREE.Vector3
  /** Marca que la geometría debe rehacerse en el próximo fotograma. */
  dirty: boolean
  /**
   * Radio de la piel bajo la calca, medido una vez por sitio.
   *
   * Medirlo en cada reconstrucción la hacía temblar: son lanzamientos de rayos
   * contra una malla con relieve, y el radio salía algo distinto cada vez, de
   * modo que el envolvente cambiaba solo con mover el deslizador. Se calcula al
   * colocar y al terminar de arrastrar, que es cuando de verdad cambia. El
   * centro del cilindro **no** se guarda: se deduce de dónde está la calca en
   * cada reconstrucción, para que el envolvente la siga al arrastrarla.
   */
  curvature: SurfaceCurvature | null
  /** Dónde se midió, para rehacerla si la calca se va lejos. */
  measuredAt: THREE.Vector3 | null
  /**
   * Trozo de la malla del cuerpo alrededor de la calca.
   *
   * `DecalGeometry` recorre la malla entera en cada reconstrucción: sobre un
   * brazo de 40.000 triángulos son 41 ms, o sea 24 fps mientras se arrastra.
   * Trabajando sobre la vecindad baja a 18 ms. Se reaprovecha mientras la calca
   * siga dentro de él.
   */
  patch: THREE.Mesh | null
  patchAt: THREE.Vector3 | null
  patchRadius: number
}

/**
 * Curvatura local de la piel bajo una calca.
 *
 * Guarda el **radio**, no el centro. El centro se vuelve a deducir en cada
 * reconstrucción a partir de donde está la calca ahora
 * (`posición − normal × radio`), y es lo que hace que el envolvente la siga al
 * arrastrarla: con el centro guardado, el anillo de proyección se quedaba
 * clavado donde se midió mientras el dibujo se iba, así que la imagen se
 * movía errática y acababa desapareciendo al salirse del anillo viejo.
 */
interface SurfaceCurvature {
  /** Radio del círculo que describe la piel; Infinity si es plana. */
  radius: number
  /** Si lo que envuelve es el ancho de la calca (si no, su alto). */
  wrapX: boolean
}

export class TattooViewer {
  private container: HTMLElement
  private callbacks: ViewerCallbacks

  private renderer: THREE.WebGLRenderer
  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera
  private controls: OrbitControls
  private pmrem: THREE.PMREMGenerator
  private envMap: THREE.Texture | null = null

  private bodyGroup: THREE.Group
  private bodyMesh: THREE.Mesh | null = null
  private decalDepth = 0.3
  /** Nº de la última carga pedida: una descarga más vieja que termina tarde se descarta. */
  private loadSeq = 0

  private decals: DecalEntry[] = []
  private selectedId: string | null = null

  private raycaster = new THREE.Raycaster()
  /** Raycaster aparte para medir, para no pisar el estado del de la interacción. */
  private probe = new THREE.Raycaster()
  private pointer = new THREE.Vector2()
  private orientHelper = new THREE.Object3D()

  private frameId = 0
  private resizeObserver: ResizeObserver
  private disposed = false

  // Estado del gesto de puntero en curso.
  private downAt: { x: number; y: number } | null = null
  private draggingId: string | null = null
  /** Puntero capturado durante el arrastre, para liberarlo al soltar. */
  private pointerId: number | null = null
  /** Dedos apoyados en el lienzo (solo táctil), por id de puntero. */
  private touches = new Map<number, { x: number; y: number }>()
  private gesture: Gesture | null = null
  /**
   * Este toque llegó a tener dos dedos. Hasta que se levanten todos no vuelve la
   * órbita ni cuenta como clic: si no, al soltar un dedo el otro giraba la
   * cámara de golpe o dejaba caer un tatuaje nuevo.
   */
  private multiTouch = false
  private sizeLimits = { min: 0.02, max: 0.4 }
  /** Encuadre de partida del modelo: a él vuelve la cámara al alejarse. */
  private homeTarget = new THREE.Vector3(0, 0.95, 0)
  private homeRange = 2.6
  /**
   * Cómo estaba la calca al empezar a arrastrarla.
   *
   * El giro se recalcula **desde aquí**, no encadenando una rotación sobre otra
   * en cada movimiento del ratón: encadenarlas acumulaba el temblor de la malla
   * y el dibujo se iba torciendo solo a lo largo del arrastre. Solo se vuelve a
   * anclar cuando la piel ha girado un cuarto de vuelta, para no llegar nunca
   * al punto donde la rotación mínima es ambigua.
   */
  private dragFrom: { normal: THREE.Vector3; quaternion: THREE.Quaternion } | null = null

  private textureLoader = new THREE.TextureLoader()
  private gltfLoader: GLTFLoader
  private objLoader = new OBJLoader()

  constructor(container: HTMLElement, callbacks: ViewerCallbacks = {}) {
    this.container = container
    this.callbacks = callbacks

    const width = Math.max(1, container.clientWidth)
    const height = Math.max(1, container.clientHeight)

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      // Necesario para poder leer el lienzo en `snapshot()`.
      preserveDrawingBuffer: true,
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(width, height)
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    container.appendChild(this.renderer.domElement)

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x0a0b0d)

    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.05, 100)
    this.camera.position.set(0, 1.05, 2.6)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.minDistance = 0.25
    this.controls.maxDistance = 8
    this.controls.target.set(0, 0.95, 0)
    // Los dos dedos los maneja el visor (`beginGesture`). Por defecto
    // OrbitControls hace zoom y desplazamiento a la vez, y como dos dedos nunca
    // se mueven parejos, cada pellizco arrastraba la cámara fuera del cuerpo.
    // Un valor que no reconoce lo deja quieto con dos dedos.
    this.controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: -1 as THREE.TOUCH }
    this.controls.update()

    // Luces: clave + relleno + contra, más un entorno de estudio para que la
    // piel tenga reflejo difuso en vez de verse plana.
    const key = new THREE.DirectionalLight(0xffffff, 2.2)
    key.position.set(2, 3, 3)
    const fill = new THREE.DirectionalLight(0xc8d6e0, 0.7)
    fill.position.set(-3, 1.5, 2)
    const rim = new THREE.DirectionalLight(0xffffff, 1.1)
    rim.position.set(0, 2, -4)
    this.scene.add(key, fill, rim, new THREE.AmbientLight(0xffffff, 0.35))

    this.pmrem = new THREE.PMREMGenerator(this.renderer)
    const room = new RoomEnvironment()
    this.envMap = this.pmrem.fromScene(room, 0.04).texture
    this.scene.environment = this.envMap
    room.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh) m.geometry.dispose()
    })

    this.bodyGroup = new THREE.Group()
    this.scene.add(this.bodyGroup)
    this.scene.add(this.orientHelper)

    this.gltfLoader = new GLTFLoader()
    this.gltfLoader.setMeshoptDecoder(MeshoptDecoder)

    const el = this.renderer.domElement
    el.addEventListener('pointerdown', this.onPointerDown)
    el.addEventListener('pointermove', this.onPointerMove)
    el.addEventListener('pointerup', this.onPointerUp)
    el.addEventListener('pointercancel', this.onPointerUp)

    this.resizeObserver = new ResizeObserver(this.onResize)
    this.resizeObserver.observe(container)

    this.loop()
  }

  /* ---------------- Modelo ---------------- */

  /** Carga el .glb del modelo, lo normaliza y lo encuadra. */
  async loadModel(model: BodyModel): Promise<void> {
    // Si se piden dos cargas seguidas (p. ej. el modelo por defecto y, enseguida,
    // el de la escena de un proyecto), solo la última llega a la escena: sin
    // esto quedaban dos cuerpos superpuestos.
    const seq = ++this.loadSeq
    this.clearBody()
    this.decalDepth = model.decalDepth
    // Cámara y límites primero: así el encuadre ya es el correcto mientras se
    // descarga, y sigue siéndolo aunque la descarga falle.
    this.setBounds(model.targetHeight)
    this.setCamera(model.camera)

    let geometry: THREE.BufferGeometry
    try {
      geometry = await this.loadGeometry(model.file)
      // glTF ya es Y-up; un .obj de Blender/Max suele venir Z-up (tumbado).
      if (model.orientation === 'z-up') geometry.rotateX(-Math.PI / 2)
    } catch (err) {
      if (seq !== this.loadSeq) return
      console.error(`No se pudo cargar ${model.file}`, err)
      this.callbacks.onError?.('No pudimos cargar este modelo 3D. Prueba con otra parte del cuerpo.')
      // El contrato es "un onModelLoaded por cada loadModel": sin esto el
      // contador de triángulos seguiría mostrando el del modelo anterior.
      this.callbacks.onModelLoaded?.({ triangles: 0 })
      return
    }
    if (this.disposed || seq !== this.loadSeq) {
      geometry.dispose()
      return
    }

    normalizeGeometry(geometry, model.targetHeight)

    const material = new THREE.MeshStandardMaterial({
      color: 0xc9a992,
      roughness: 0.62,
      metalness: 0.0,
    })
    this.bodyMesh = new THREE.Mesh(geometry, material)
    this.bodyMesh.name = 'body'
    this.bodyGroup.add(this.bodyMesh)

    const index = geometry.getIndex()
    const triangles = (index ? index.count : geometry.getAttribute('position').count) / 3
    this.callbacks.onModelLoaded?.({ triangles: Math.round(triangles) })
  }

  /**
   * Ajusta órbita y planos de recorte al tamaño de la pieza. Los límites fijos
   * de antes estaban pensados para un cuerpo de 1.75 m: con ellos, una cabeza
   * de 26 cm se quedaba clavada a su distancia de encuadre (0.44 m) sin poder
   * acercarse. Con h=1.75 estos cálculos dan casi los mismos valores de antes.
   */
  private setBounds(height: number) {
    this.controls.minDistance = Math.max(0.05, height * 0.12)
    this.controls.maxDistance = Math.max(1.5, height * 5)
    this.camera.near = Math.max(0.01, height * 0.02)
    this.camera.far = Math.max(20, height * 40)
    this.camera.updateProjectionMatrix()
    this.controls.update()
  }

  /** Descarga el archivo y devuelve una única geometría fusionada. */
  private async loadGeometry(file: string): Promise<THREE.BufferGeometry> {
    const ext = file.split(/[?#]/)[0].split('.').pop()?.toLowerCase()
    if (ext === 'obj') {
      const group = await this.objLoader.loadAsync(file)
      return extractGeometry(group)
    }
    // .glb / .gltf
    const gltf = await this.gltfLoader.loadAsync(file)
    return extractGeometry(gltf.scene)
  }

  private clearBody() {
    // Las calcas cuelgan del cuerpo: se van con él.
    for (const d of this.decals) this.disposeDecal(d)
    this.decals = []
    this.selectedId = null

    if (!this.bodyMesh) return
    this.bodyGroup.remove(this.bodyMesh)
    this.bodyMesh.geometry.dispose()
    ;(this.bodyMesh.material as THREE.Material).dispose()
    this.bodyMesh = null
  }

  /* ---------------- Cámara ---------------- */

  setCamera(preset: CameraPreset) {
    this.camera.position.set(...preset.position)
    this.controls.target.set(...preset.target)
    this.homeTarget.copy(this.controls.target)
    this.homeRange = this.camera.position.distanceTo(this.controls.target)
    this.controls.update()
  }

  /** Tamaño mínimo y máximo (ancho, m) que admite el gesto de pellizco. */
  setSizeLimits(min: number, max: number) {
    this.sizeLimits = { min, max: Math.max(min, max) }
  }

  zoom(factor: number) {
    const dir = this.camera.position.clone().sub(this.controls.target)
    const len = THREE.MathUtils.clamp(
      dir.length() * factor,
      this.controls.minDistance,
      this.controls.maxDistance,
    )
    this.camera.position.copy(this.controls.target).add(dir.normalize().multiplyScalar(len))
    this.controls.update()
  }

  orbit(deltaAzimuth: number, deltaPolar = 0) {
    const offset = this.camera.position.clone().sub(this.controls.target)
    const spherical = new THREE.Spherical().setFromVector3(offset)
    spherical.theta += deltaAzimuth
    spherical.phi = THREE.MathUtils.clamp(spherical.phi + deltaPolar, 0.05, Math.PI - 0.05)
    this.camera.position.copy(this.controls.target).add(offset.setFromSpherical(spherical))
    this.controls.update()
  }

  getCameraPreset(): CameraPreset {
    return {
      position: this.camera.position.toArray() as [number, number, number],
      target: this.controls.target.toArray() as [number, number, number],
    }
  }

  /* ---------------- Calcas ---------------- */

  /** Construye el cuaternión de una calca a partir de la normal y un giro. */
  orientationFor(normal: [number, number, number], roll = 0): [number, number, number, number] {
    const n = new THREE.Vector3(...normal)
    this.orientHelper.position.set(0, 0, 0)
    this.orientHelper.up.set(0, 1, 0)
    // Si la normal es casi vertical, `lookAt` degenera: se inclina el "arriba".
    if (Math.abs(n.y) > 0.99) this.orientHelper.up.set(0, 0, 1)
    this.orientHelper.lookAt(n)
    this.orientHelper.rotateZ(roll)
    return this.orientHelper.quaternion.toArray() as [number, number, number, number]
  }

  async addPlacement(input: PlacementInput): Promise<void> {
    if (!this.bodyMesh) return

    let texture: THREE.Texture
    try {
      texture = await this.textureLoader.loadAsync(input.textureUrl)
    } catch {
      this.callbacks.onError?.('No pudimos cargar la imagen del boceto.')
      return
    }
    if (this.disposed || !this.bodyMesh) {
      texture.dispose()
      return
    }

    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy()

    const material = new THREE.MeshStandardMaterial({
      map: texture,
      transparent: true,
      // Las calcas no escriben profundidad: así no se ocluyen entre ellas.
      depthTest: true,
      depthWrite: false,
      // Son coplanares con la piel; sin este sesgo habría z-fighting.
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
      roughness: 0.75,
      metalness: 0,
    })

    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material)
    mesh.name = `decal:${input.id}`
    mesh.renderOrder = this.decals.length + 1
    this.bodyMesh.add(mesh)

    const entry: DecalEntry = {
      id: input.id,
      mesh,
      material,
      texture,
      position: new THREE.Vector3(...input.position),
      quaternion: new THREE.Quaternion(...input.quaternion),
      size: new THREE.Vector3(...input.size),
      dirty: true,
      curvature: null,
      measuredAt: null,
      patch: null,
      patchAt: null,
      patchRadius: 0,
    }
    this.decals.push(entry)
  }

  updatePlacement(
    id: string,
    patch: Partial<{
      position: [number, number, number]
      quaternion: [number, number, number, number]
      size: [number, number, number]
    }>,
  ) {
    const entry = this.decals.find((d) => d.id === id)
    if (!entry) return

    if (patch.position) {
      entry.position.set(...patch.position)
      entry.dirty = true
    }
    if (patch.quaternion) {
      entry.quaternion.set(...patch.quaternion)
      entry.dirty = true
    }
    if (patch.size) {
      entry.size.set(...patch.size)
      entry.dirty = true
    }
  }

  /** Gira la calca sobre su propio plano (eje normal a la piel). */
  rollPlacement(id: string, deltaRadians: number): [number, number, number, number] | null {
    const entry = this.decals.find((d) => d.id === id)
    if (!entry) return null
    const spin = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), deltaRadians)
    entry.quaternion.multiply(spin)
    entry.dirty = true
    return entry.quaternion.toArray() as [number, number, number, number]
  }

  removePlacement(id: string) {
    const i = this.decals.findIndex((d) => d.id === id)
    if (i === -1) return
    this.disposeDecal(this.decals[i])
    this.decals.splice(i, 1)
    this.decals.forEach((d, n) => {
      d.mesh.renderOrder = n + 1
    })
    if (this.selectedId === id) this.selectedId = null
  }

  select(id: string | null) {
    this.selectedId = id
  }

  private disposeDecal(entry: DecalEntry) {
    entry.patch?.geometry.dispose()
    entry.mesh.removeFromParent()
    entry.mesh.geometry.dispose()
    entry.material.dispose()
    entry.texture.dispose()
  }

  /** Rehace la geometría de las calcas marcadas como sucias. */
  private rebuildDirtyDecals() {
    if (!this.bodyMesh) return
    for (const entry of this.decals) {
      if (!entry.dirty) continue
      entry.dirty = false

      const geometry = this.buildDecalGeometry(entry)
      if (!geometry) continue
      entry.mesh.geometry.dispose()
      entry.mesh.geometry = geometry
      // DecalGeometry emite vértices en espacio de mundo y la calca cuelga del
      // cuerpo, que está en la identidad: no hace falta transformar nada más.
      entry.mesh.position.set(0, 0, 0)
      entry.mesh.quaternion.identity()
      entry.mesh.scale.set(1, 1, 1)
    }
  }

  /* ---------------- Interacción ---------------- */

  private updatePointer(e: { clientX: number; clientY: number }) {
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
    this.raycaster.setFromCamera(this.pointer, this.camera)
  }

  private onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0 || !this.bodyMesh) return

    if (e.pointerType === 'touch') {
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (this.touches.size === 2) {
        this.beginGesture()
        return
      }
      // Un tercer dedo no cambia nada; y un dedo que llega cuando el gesto ya
      // terminó tampoco empieza otra cosa hasta que se levanten todos.
      if (this.touches.size > 2 || this.multiTouch) return
    }

    this.downAt = { x: e.clientX, y: e.clientY }
    this.updatePointer(e)

    // Primero las calcas: si se pincha una, se selecciona y se puede arrastrar.
    const meshes = this.decals.map((d) => d.mesh)
    const onDecal = meshes.length ? this.raycaster.intersectObjects(meshes, false)[0] : undefined
    // Pinchar justo encima de un dibujo de línea es difícil: entre trazo y
    // trazo se ve la piel, y el clic se iba al cuerpo. Entonces el arrastre
    // giraba la cámara en vez de mover el tatuaje, y parecía que todo se movía
    // solo. Si el punto cae dentro de la huella de la calca elegida, cuenta
    // como agarrarla.
    const grabbed = onDecal ? null : this.decalUnderPointer()
    if (onDecal || grabbed) {
      const id = onDecal ? onDecal.object.name.replace('decal:', '') : grabbed!
      this.selectedId = id
      this.draggingId = id
      this.controls.enabled = false
      // Sin capturar el puntero, sacarlo del lienzo a mitad del arrastre
      // cortaba los eventos: el arrastre se quedaba abierto, la órbita seguía
      // bloqueada y al volver a entrar la calca pegaba un salto hasta el
      // cursor. Con captura, el gesto termina siempre donde el artista lo
      // suelta.
      this.pointerId = e.pointerId
      try {
        this.renderer.domElement.setPointerCapture(e.pointerId)
      } catch {
        // Algún navegador puede rechazarla; el arrastre sigue funcionando
        // dentro del lienzo.
      }

      const entry = this.decals.find((d) => d.id === id)
      this.dragFrom = entry
        ? {
            normal: FORWARD.clone().applyQuaternion(entry.quaternion),
            quaternion: entry.quaternion.clone(),
          }
        : null

      this.callbacks.onSelect?.(id)
    }
  }

  /**
   * Calca cuya huella contiene el punto del cuerpo que señala el puntero.
   *
   * Se prefiere la elegida, que es la que el artista está tocando; si no, la
   * más pequeña que lo contenga, para poder agarrar una calca chica encima de
   * otra grande.
   */
  private decalUnderPointer(): string | null {
    if (!this.bodyMesh || this.decals.length === 0) return null
    const hit = this.raycaster.intersectObject(this.bodyMesh, false)[0]
    if (!hit) return null

    const contains = (entry: DecalEntry) =>
      hit.point.distanceTo(entry.position) <= Math.max(entry.size.x, entry.size.y) / 2

    const selected = this.decals.find((d) => d.id === this.selectedId)
    if (selected && contains(selected)) return selected.id

    const candidates = this.decals.filter(contains)
    if (candidates.length === 0) return null
    return candidates.reduce((smallest, entry) =>
      Math.max(entry.size.x, entry.size.y) < Math.max(smallest.size.x, smallest.size.y)
        ? entry
        : smallest,
    ).id
  }

  private onPointerMove = (e: PointerEvent) => {
    const finger = e.pointerType === 'touch' ? this.touches.get(e.pointerId) : undefined
    if (finger) {
      finger.x = e.clientX
      finger.y = e.clientY
    }
    if (this.gesture) {
      this.applyGesture()
      return
    }
    if (this.multiTouch) return

    if (!this.draggingId || !this.bodyMesh) return
    this.updatePointer(e)
    const hit = this.raycaster.intersectObject(this.bodyMesh, false)[0]
    if (!hit || !hit.face) return

    const entry = this.decals.find((d) => d.id === this.draggingId)
    if (!entry) return

    // `hit.normal` viene interpolada entre los vértices; `hit.face.normal` es la
    // de la cara plana y hacía que la calca saltara de triángulo en triángulo
    // al arrastrarla sobre un brazo de pocos polígonos.
    const normal = smoothNormal(hit, this.bodyMesh)
    if (!normal) return

    // Se gira lo mínimo para pasar de la normal donde empezó el arrastre a la
    // de ahora, aplicado sobre la orientación de partida. Rehacer la
    // orientación desde cero perdía el giro que el artista había dado; ir
    // encadenando rotaciones lo conservaba pero acumulaba el temblor de la
    // malla y el dibujo se torcía solo. Partir siempre del origen no deriva.
    const from = this.dragFrom
    if (from) {
      const align = new THREE.Quaternion().setFromUnitVectors(from.normal, normal)
      entry.quaternion.copy(from.quaternion).premultiply(align).normalize()
      // Al dar la vuelta a un miembro la normal acaba casi opuesta a la de
      // partida, y ahí la rotación mínima es ambigua: el eje de giro se vuelve
      // indeterminado y el dibujo pegaba un volantazo. Se vuelve a anclar el
      // origen cada vez que la piel ha girado un cuarto de vuelta, así nunca
      // se llega a ese punto y de paso el temblor de la malla solo entra una
      // vez por tramo en lugar de acumularse en cada movimiento del ratón.
      if (from.normal.dot(normal) < REANCHOR_DOT) {
        from.normal.copy(normal)
        from.quaternion.copy(entry.quaternion)
      }
    }

    entry.position.copy(hit.point)
    entry.dirty = true
  }

  private onPointerUp = (e: PointerEvent) => {
    if (e.pointerType === 'touch') {
      this.touches.delete(e.pointerId)
      if (this.multiTouch) {
        if (this.gesture && this.touches.size < 2) this.endGesture()
        if (this.touches.size === 0) {
          this.multiTouch = false
          this.controls.enabled = true
        }
        return
      }
    }

    const wasDragging = this.draggingId
    this.controls.enabled = true
    this.draggingId = null
    this.dragFrom = null
    if (this.pointerId !== null) {
      try {
        this.renderer.domElement.releasePointerCapture(this.pointerId)
      } catch {
        // Ya estaba liberada.
      }
      this.pointerId = null
    }

    if (wasDragging) {
      const entry = this.decals.find((d) => d.id === wasDragging)
      if (entry) {
        // Ahora sí: la calca está en su sitio definitivo, se mide la piel de
        // ahí y se rehace la geometría con ella.
        entry.measuredAt = null
        entry.dirty = true
        this.callbacks.onTransform?.(wasDragging, {
          position: entry.position.toArray() as [number, number, number],
          quaternion: entry.quaternion.toArray() as [number, number, number, number],
          size: entry.size.toArray() as [number, number, number],
        })
      }
      this.downAt = null
      return
    }

    // Un clic (no un arrastre de órbita) sobre el cuerpo coloca un tatuaje.
    const down = this.downAt
    this.downAt = null
    if (!down || !this.bodyMesh) return
    const slop = e.pointerType === 'touch' ? TAP_SLOP : CLICK_SLOP
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > slop) return

    this.updatePointer(e)
    const hit = this.raycaster.intersectObject(this.bodyMesh, false)[0]
    if (!hit || !hit.face) {
      if (this.selectedId) {
        this.selectedId = null
        this.callbacks.onSelect?.(null)
      }
      return
    }

    const normal = smoothNormal(hit, this.bodyMesh)
    if (!normal) return

    this.callbacks.onPlace?.({
      point: hit.point.toArray() as [number, number, number],
      normal: normal.toArray() as [number, number, number],
      faceIndex: hit.faceIndex ?? -1,
      uv: hit.uv ? ([hit.uv.x, hit.uv.y] as [number, number]) : null,
    })
  }

  /* ---------------- Gestos de dos dedos ---------------- */

  /** Los dos primeros dedos apoyados, con su separación, ángulo y punto medio. */
  private fingers() {
    const [a, b] = [...this.touches.values()]
    return {
      a,
      b,
      distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
      // En pantalla la Y crece hacia abajo, así que este ángulo crece en
      // sentido horario.
      angle: Math.atan2(b.y - a.y, b.x - a.x),
      mid: { clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 },
    }
  }

  /**
   * Calca a la que va dirigido un gesto de dos dedos, o null si es para la
   * cámara.
   *
   * Solo la calca **elegida** recibe el gesto (o la que se venía arrastrando,
   * que es la elegida). Así elegir un tatuaje es entrar a editarlo, y soltarlo
   * devuelve los dos dedos a la cámara: si cualquier calca bajo los dedos se
   * agrandara, no habría forma de acercar la cámara a un tatuaje para mirarlo.
   * Vale tocarla o caer cerca (`PINCH_REACH`): sobre un tatuaje chico no caben
   * dos dedos.
   */
  private gestureTarget(): DecalEntry | null {
    if (!this.bodyMesh || this.decals.length === 0) return null

    const dragged = this.decals.find((d) => d.id === this.draggingId)
    if (dragged) return dragged

    const selected = this.decals.find((d) => d.id === this.selectedId)
    if (!selected) return null

    const { a, b, mid } = this.fingers()
    const points = [mid, { clientX: a.x, clientY: a.y }, { clientX: b.x, clientY: b.y }]
    const reach = (Math.max(selected.size.x, selected.size.y) / 2) * PINCH_REACH

    for (const point of points) {
      this.updatePointer(point)
      if (this.raycaster.intersectObject(selected.mesh, false).length > 0) return selected
      const hit = this.raycaster.intersectObject(this.bodyMesh, false)[0]
      if (hit && hit.point.distanceTo(selected.position) <= reach) return selected
    }
    return null
  }

  private beginGesture() {
    const entry = this.gestureTarget()

    // Si un dedo ya estaba arrastrando la calca, el arrastre termina aquí: con
    // dos dedos se cambia tamaño y giro, no posición.
    if (this.draggingId) {
      const dragged = this.decals.find((d) => d.id === this.draggingId)
      if (dragged) dragged.measuredAt = null
    }
    this.draggingId = null
    this.dragFrom = null
    this.downAt = null
    if (this.pointerId !== null) {
      try {
        this.renderer.domElement.releasePointerCapture(this.pointerId)
      } catch {
        // Ya estaba liberada.
      }
      this.pointerId = null
    }
    this.multiTouch = true
    this.controls.enabled = false

    const { distance, angle, mid } = this.fingers()

    if (entry) {
      this.gesture = {
        kind: 'decal',
        entry,
        distance,
        lastAngle: angle,
        twist: 0,
        rollSent: 0,
        size: entry.size.clone(),
        quaternion: entry.quaternion.clone(),
        lastEmit: 0,
      }
      return
    }

    // Para la cámara: se acerca hacia el punto del cuerpo que queda entre los
    // dedos, que es lo que la persona está mirando.
    this.updatePointer(mid)
    const hit = this.bodyMesh ? this.raycaster.intersectObject(this.bodyMesh, false)[0] : undefined
    const offset = this.camera.position.clone().sub(this.controls.target)
    this.gesture = {
      kind: 'camera',
      distance,
      target: this.controls.target.clone(),
      direction: offset.clone().normalize(),
      range: offset.length(),
      anchor: hit ? hit.point.clone() : null,
    }
  }

  private applyGesture() {
    const gesture = this.gesture
    if (!gesture || this.touches.size < 2) return
    const { distance, angle } = this.fingers()

    if (gesture.kind === 'camera') {
      this.pinchCamera(gesture, distance)
      return
    }

    const { entry } = gesture
    // Tamaño: proporcional a cuánto se separaron los dedos, dentro de lo que
    // admite la zona. Se escala el ancho y el alto lo sigue.
    const width = THREE.MathUtils.clamp(
      gesture.size.x * (distance / gesture.distance),
      this.sizeLimits.min,
      this.sizeLimits.max,
    )
    const scale = width / gesture.size.x
    entry.size.set(width, gesture.size.y * scale, gesture.size.z)

    // Giro: se va sumando el cambio de ángulo entre movimientos (así puede pasar
    // de 180° sin saltar) y se le descuenta la holgura.
    let step = angle - gesture.lastAngle
    if (step > Math.PI) step -= Math.PI * 2
    if (step < -Math.PI) step += Math.PI * 2
    gesture.twist += step
    gesture.lastAngle = angle

    const beyond = Math.max(0, Math.abs(gesture.twist) - TWIST_DEADZONE)
    // El eje Z de la calca sale de la piel hacia quien mira: girarla en positivo
    // es antihorario visto de frente, al revés que el ángulo de pantalla.
    const roll = -Math.sign(gesture.twist) * beyond
    entry.quaternion
      .copy(gesture.quaternion)
      .multiply(new THREE.Quaternion().setFromAxisAngle(FORWARD, roll))
    entry.dirty = true

    const now = performance.now()
    if (now - gesture.lastEmit >= GESTURE_EMIT_MS) {
      gesture.lastEmit = now
      this.emitGesture(gesture, roll)
    }
  }

  /** Le cuenta a la página cómo va (o cómo quedó) la calca del gesto. */
  private emitGesture(gesture: Extract<Gesture, { kind: 'decal' }>, roll: number) {
    const { entry } = gesture
    this.callbacks.onTransform?.(entry.id, {
      position: entry.position.toArray() as [number, number, number],
      quaternion: entry.quaternion.toArray() as [number, number, number, number],
      size: entry.size.toArray() as [number, number, number],
      rollDelta: roll - gesture.rollSent,
    })
    gesture.rollSent = roll
  }

  /**
   * Zoom de la cámara con dos dedos, sin desplazamiento libre.
   *
   * Al acercar, la cámara avanza en línea recta hacia el punto del cuerpo que
   * quedó entre los dedos, así que ese punto no se mueve de su sitio en
   * pantalla. Al alejar, el objetivo vuelve hacia el encuadre de partida, de
   * modo que el cuerpo termina siempre centrado.
   */
  private pinchCamera(gesture: Extract<Gesture, { kind: 'camera' }>, distance: number) {
    // Alejar tiene un tope más corto que el de los botones: con los dedos es
    // fácil pasarse, y un cuerpo del tamaño de una uña no le sirve a nadie.
    const farthest = Math.max(
      gesture.range,
      Math.min(this.controls.maxDistance, this.homeRange * PINCH_MAX_ZOOM_OUT),
    )
    const range = THREE.MathUtils.clamp(
      gesture.range * (gesture.distance / distance),
      this.controls.minDistance,
      farthest,
    )
    const target = gesture.target.clone()

    if (range < gesture.range) {
      if (gesture.anchor) target.lerp(gesture.anchor, 1 - range / gesture.range)
    } else if (range > gesture.range) {
      const span = this.homeRange - gesture.range
      const back = span > 1e-4 ? Math.min(1, (range - gesture.range) / span) : 1
      target.lerp(this.homeTarget, back)
    }

    this.controls.target.copy(target)
    this.camera.position.copy(target).addScaledVector(gesture.direction, range)
    this.controls.update()
  }

  private endGesture() {
    const gesture = this.gesture
    this.gesture = null
    if (!gesture || gesture.kind !== 'decal') return

    // Como al soltar un arrastre: la calca quedó en su forma definitiva, se
    // vuelve a medir la piel y se rehace con ella.
    const { entry } = gesture
    entry.measuredAt = null
    entry.dirty = true
    const beyond = Math.max(0, Math.abs(gesture.twist) - TWIST_DEADZONE)
    this.emitGesture(gesture, -Math.sign(gesture.twist) * beyond)
  }

  /** Profundidad del proyector para el modelo/zona activos. */
  /** Profundidad de la caja para una calca nueva, ya con el margen aplicado. */
  /**
   * Construye la geometría de una calca sobre la piel.
   *
   * Sobre una superficie plana basta la proyección de siempre. Sobre un brazo o
   * una muñeca no, porque una caja plana **no pasa de la silueta**: lo que
   * sobra se proyecta al aire y el dibujo sale cortado. Para que el tatuaje
   * rodee el miembro se proyecta una caja que abarca el anillo entero y después
   * se recalculan las coordenadas de textura **por ángulo alrededor del eje**,
   * en vez de por distancia en plano.
   *
   * Esa es toda la diferencia: una proyección plana reparte la imagen según la
   * sombra del dibujo, que se agolpa al llegar al borde; repartirla por ángulo
   * la hace avanzar a paso constante sobre la piel y seguir la curva hasta dar
   * la vuelta.
   */
  private buildDecalGeometry(entry: DecalEntry): THREE.BufferGeometry | null {
    if (!this.bodyMesh) return null

    const forward = FORWARD.clone().applyQuaternion(entry.quaternion)
    const right = RIGHT.clone().applyQuaternion(entry.quaternion)
    const up = UP.clone().applyQuaternion(entry.quaternion)

    const curve = this.curvatureFor(entry, forward, right, up)
    const wrapX = curve?.wrapX ?? true
    const span = wrapX ? entry.size.x : entry.size.y
    const arc = curve ? span / curve.radius : 0
    const wrapping = curve !== null && arc >= MIN_WRAP_ANGLE
    const reach = Math.max(entry.size.x, entry.size.y)

    // Cuánta malla hay que tener a mano. Al envolver, la caja abarca el anillo
    // entero y su centro está un radio por dentro de la piel, así que alcanza
    // bastante más lejos que la propia calca; con el margen de antes (un solo
    // radio) el recorte se quedaba corto y la imagen aparecía mordida por los
    // lados en cuanto la calca era pequeña sobre un miembro grueso.
    const patch = this.patchFor(
      entry,
      wrapping ? curve.radius * (1 + RING_MARGIN) + reach / 2 : reach * 0.75,
    )

    const flat = () =>
      this.flatDecal(entry.position, entry.quaternion, entry.size, forward, true, patch)

    if (!wrapping) return flat()

    // Eje del miembro: perpendicular a la normal y a la dirección que se
    // envuelve. La calca gira alrededor de él.
    const axis = wrapX ? right : up
    const spin = new THREE.Vector3().crossVectors(forward, axis).normalize()
    const { radius } = curve
    // El eje del cilindro pasa un radio por dentro de la piel, bajo la calca.
    // Se deduce aquí y no se guarda: así sigue a la calca mientras se arrastra.
    const center = entry.position.clone().addScaledVector(forward, -radius)

    // La caja abarca el anillo completo; el recorte fino lo hace el reparto por
    // ángulo, que descarta lo que queda fuera del arco del dibujo.
    const ring = radius * 2 * RING_MARGIN
    const across = wrapX ? entry.size.y : entry.size.x
    const size = new THREE.Vector3(
      wrapX ? ring : across,
      wrapX ? across : ring,
      ring,
    )

    const geometry = this.flatDecal(center, entry.quaternion, size, forward, false, patch)
    if (!geometry) return null

    // Si el reparto por ángulo no deja ni un triángulo (pasa al borde de una
    // zona, donde el cilindro deja de describir la piel) se cae a la
    // proyección plana. Antes se devolvía null y la calca se quedaba con la
    // geometría vieja: se congelaba a mitad del arrastre y luego pegaba un
    // salto al volver a entrar.
    return wrapUv(geometry, { center, spin, forward, axis, radius, arc, across, wrapX }) ?? flat()
  }

  /**
   * Curvatura de la piel bajo una calca, medida solo cuando hace falta.
   *
   * Medirla en cada reconstrucción la hacía temblar: son rayos contra una malla
   * con relieve y el radio salía algo distinto cada vez, así que el envolvente
   * cambiaba solo con mover el deslizador de tamaño. Se vuelve a medir cuando
   * la calca se ha ido lo bastante lejos de donde se midió.
   */
  private curvatureFor(
    entry: DecalEntry,
    forward: THREE.Vector3,
    right: THREE.Vector3,
    up: THREE.Vector3,
  ): SurfaceCurvature | null {
    // Mientras se arrastra no se vuelve a medir: cada medición da un radio algo
    // distinto y el envolvente cambiaba de golpe cada centímetro, que es lo que
    // hacía que el dibujo saltara al moverlo. Se queda con el radio de donde
    // empezó y se actualiza al soltar. Congelar el radio no clava la calca: el
    // centro del cilindro se deduce de su posición en cada reconstrucción.
    if (this.draggingId === entry.id && entry.curvature !== null) return entry.curvature

    const moved =
      !entry.measuredAt || entry.measuredAt.distanceTo(entry.position) > REMEASURE_DISTANCE
    if (!moved) return entry.curvature

    const curveX = this.fitCurvature(entry.position, forward, right)
    const curveY = this.fitCurvature(entry.position, forward, up)
    const wrapX = (curveX?.radius ?? Infinity) <= (curveY?.radius ?? Infinity)
    const chosen = wrapX ? curveX : curveY

    entry.curvature = chosen ? { ...chosen, wrapX } : null
    entry.measuredAt = entry.position.clone()
    return entry.curvature
  }

  /**
   * Trozo de malla sobre el que proyectar esta calca.
   *
   * `needed` es el alcance que la proyección necesita alrededor de la calca, y
   * lo decide quien llama: envolver abarca el anillo entero del miembro y pide
   * mucho más que una calca plana. Se reaprovecha mientras la calca siga
   * cómodamente dentro —rehacerlo en cada fotograma costaría más que el
   * ahorro— y el margen extra es justamente para que un arrastre corto no
   * obligue a rehacerlo.
   */
  private patchFor(entry: DecalEntry, needed: number): THREE.Mesh {
    if (!this.bodyMesh) return this.bodyMesh!

    const covered =
      entry.patchAt !== null &&
      entry.patchAt.distanceTo(entry.position) + needed <= entry.patchRadius

    // Se guarda también el "aquí no sale a cuenta recortar": si no, se volvía a
    // recorrer la malla entera en cada fotograma para llegar a la misma
    // conclusión.
    if (covered) return entry.patch ?? this.bodyMesh

    const radius = needed + PATCH_SLACK
    const patch = localPatch(this.bodyMesh, entry.position, radius)

    entry.patch?.geometry.dispose()
    entry.patch = patch
    entry.patchAt = entry.position.clone()
    entry.patchRadius = radius
    return patch ?? this.bodyMesh
  }

  /** La proyección plana de siempre, recortada a la cara que mira al proyector. */
  private flatDecal(
    position: THREE.Vector3,
    quaternion: THREE.Quaternion,
    size: THREE.Vector3,
    forward: THREE.Vector3,
    cullBack = true,
    target: THREE.Mesh = this.bodyMesh!,
  ): THREE.BufferGeometry | null {
    try {
      const euler = new THREE.Euler().setFromQuaternion(quaternion)
      const geometry = new DecalGeometry(target, position, euler, size)
      // La caja atraviesa el miembro de lado a lado, así que recorta también la
      // cara de atrás y el dibujo salía repetido por detrás. Al envolver no se
      // descarta aquí: ahí la cara "de atrás" es justamente la que se busca, y
      // el recorte lo hace el reparto por ángulo.
      return cullBack ? cullAwayFacing(geometry, forward) : geometry
    } catch {
      return null
    }
  }

  /**
   * Curvatura de la piel en una dirección: radio y centro del círculo que
   * mejor la describe ahí. Devuelve null donde es plana.
   *
   * Se ajusta una circunferencia por **tres puntos de la superficie**, no por
   * el giro de las normales. Las normales de estas mallas vienen suavizadas y
   * sobre un modelo de pocos polígonos giran menos de lo que gira la piel: en
   * un antebrazo daban 7,4 cm de radio donde la medida real es menos de la
   * mitad, y con el centro tan lejos el envolvente se perdía a los pocos
   * grados. Tres puntos dan el círculo exacto que pasa por ellos.
   */
  private fitCurvature(
    position: THREE.Vector3,
    forward: THREE.Vector3,
    axis: THREE.Vector3,
  ): { radius: number } | null {
    let left: { point: THREE.Vector3; normal: THREE.Vector3 } | null = null
    let right: { point: THREE.Vector3; normal: THREE.Vector3 } | null = null
    for (const span of CURVATURE_SPANS) {
      left = this.surfaceAt(position.clone().addScaledVector(axis, -span), forward)
      right = this.surfaceAt(position.clone().addScaledVector(axis, span), forward)
      if (left && right) break
    }
    if (!left || !right) return null

    // Coordenadas en el plano del giro: `axis` hacia un lado, `forward` hacia
    // fuera de la piel, con el punto de colocación en el origen.
    const flatten = (point: THREE.Vector3) => {
      const d = point.clone().sub(position)
      return { x: d.dot(axis), y: d.dot(forward) }
    }
    const a = { x: 0, y: 0 }
    const b = flatten(left.point)
    const c = flatten(right.point)

    // Circuncentro de los tres puntos.
    const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y))
    if (Math.abs(d) < 1e-9) return null // alineados: la piel es plana aquí

    const aSq = a.x * a.x + a.y * a.y
    const bSq = b.x * b.x + b.y * b.y
    const cSq = c.x * c.x + c.y * c.y
    const cx = (aSq * (b.y - c.y) + bSq * (c.y - a.y) + cSq * (a.y - b.y)) / d
    const cy = (aSq * (c.x - b.x) + bSq * (a.x - c.x) + cSq * (b.x - a.x)) / d

    const radius = Math.hypot(cx - a.x, cy - a.y)
    if (!Number.isFinite(radius) || radius <= 0 || radius > MAX_CURVE_RADIUS) return null
    // El centro debe quedar por dentro de la piel; si sale hacia fuera, la
    // superficie es cóncava aquí y no hay nada que envolver.
    if (cy > 0) return null

    return { radius }
  }

  /** Punto y normal de la piel justo delante de `from`, mirando por `forward`. */
  private surfaceAt(
    from: THREE.Vector3,
    forward: THREE.Vector3,
  ): { point: THREE.Vector3; normal: THREE.Vector3 } | null {
    this.probe.set(from.clone().addScaledVector(forward, PROBE_STANDOFF), forward.clone().negate())
    const hit = this.probe.intersectObject(this.bodyMesh!, false)[0]
    if (!hit?.normal) return null
    return { point: hit.point, normal: hit.normal }
  }

  get projectorDepth(): number {
    return this.decalDepth * PROJECTOR_REACH
  }

  setProjectorDepth(depth: number) {
    this.decalDepth = depth
  }

  /* ---------------- Ciclo y utilidades ---------------- */

  private onResize = () => {
    const w = Math.max(1, this.container.clientWidth)
    const h = Math.max(1, this.container.clientHeight)
    this.renderer.setSize(w, h)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  private loop = () => {
    if (this.disposed) return
    this.frameId = requestAnimationFrame(this.loop)
    this.rebuildDirtyDecals()
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
  }

  /** PNG del lienzo tal como se ve ahora. */
  snapshot(): Promise<Blob | null> {
    this.rebuildDirtyDecals()
    this.renderer.render(this.scene, this.camera)
    return new Promise((resolve) => {
      this.renderer.domElement.toBlob((blob) => resolve(blob), 'image/png')
    })
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    cancelAnimationFrame(this.frameId)

    const el = this.renderer.domElement
    el.removeEventListener('pointerdown', this.onPointerDown)
    el.removeEventListener('pointermove', this.onPointerMove)
    el.removeEventListener('pointerup', this.onPointerUp)
    el.removeEventListener('pointercancel', this.onPointerUp)
    this.resizeObserver.disconnect()

    this.clearBody()
    this.controls.dispose()
    this.envMap?.dispose()
    this.pmrem.dispose()
    this.renderer.dispose()
    el.remove()
  }
}

/* ================= Helpers de geometría ================= */

/**
 * Saca una única geometría del modelo cargado (grupo de glTF u OBJ).
 * `DecalGeometry` solo acepta una malla, así que si el modelo viene partido en
 * varias se fusionan todas en world-space. Si a alguna parte le faltan normales
 * o UVs se rellenan (los `.obj` sin `vn`/`vt` son habituales).
 */
function extractGeometry(root: THREE.Object3D): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  root.updateWorldMatrix(true, true)

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh || !mesh.geometry) return
    const geo = mesh.geometry.clone()
    geo.applyMatrix4(mesh.matrixWorld)
    // `mergeGeometries` exige los mismos atributos en todas las partes.
    for (const name of Object.keys(geo.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') geo.deleteAttribute(name)
    }
    if (!geo.getAttribute('normal')) geo.computeVertexNormals()
    if (!geo.getAttribute('uv')) {
      const count = geo.getAttribute('position').count
      geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2))
    }
    parts.push(geo.toNonIndexed())
  })

  if (parts.length === 0) throw new Error('El modelo no contiene ninguna malla.')
  if (parts.length === 1) return parts[0]

  const merged = mergeGeometries(parts, false)
  parts.forEach((p) => p.dispose())
  if (!merged) throw new Error('No se pudieron fusionar las mallas del modelo.')
  return merged
}

/**
 * Deja la geometría centrada en X/Z, con la base en y=0 y con `targetHeight`
 * metros de alto, horneando la transformación. Así el objeto queda en la
 * identidad y el espacio del mundo coincide con el del modelo: las coordenadas
 * guardadas son estables, y un tatuaje de 12 cm mide 12 cm tanto en un cuerpo
 * entero como en una cabeza suelta.
 */
function normalizeGeometry(geometry: THREE.BufferGeometry, targetHeight: number) {
  geometry.computeBoundingBox()
  const box = geometry.boundingBox
  if (!box) return

  const size = new THREE.Vector3()
  box.getSize(size)
  const scale = targetHeight / (size.y || 1)

  const center = new THREE.Vector3()
  box.getCenter(center)

  const m = new THREE.Matrix4()
    .makeScale(scale, scale, scale)
    .multiply(new THREE.Matrix4().makeTranslation(-center.x, -box.min.y, -center.z))
  geometry.applyMatrix4(m)
  // Ojo: NO se recalculan las normales. `applyMatrix4` con un escalado uniforme
  // y positivo ya las deja bien, mientras que `computeVertexNormals()` sobre
  // una geometría sin índice le da a cada triángulo su propia normal — o sea,
  // sombreado facetado, tirando las normales suaves del .glb. En un cuerpo a
  // 2.6 m pasaba por "estilo low-poly"; en una cabeza que llena la vista se
  // vería rota.
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
}

