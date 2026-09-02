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
 * El cuerpo se normaliza al cargarse (centrado, escalado a estatura estándar y
 * con la transformación horneada en la geometría), de modo que el objeto queda
 * en la identidad y el espacio del mundo coincide con el del modelo. Gracias a
 * eso las coordenadas que se guardan en la base de datos son estables.
 */

/** Estatura a la que se normaliza cualquier modelo cargado (m). */
const TARGET_HEIGHT = 1.75
/** Píxeles de desplazamiento por debajo de los cuales un arrastre es un clic. */
const CLICK_SLOP = 5

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
  opacity?: number
}

export interface PlacementTransform {
  position: [number, number, number]
  quaternion: [number, number, number, number]
  size: [number, number, number]
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

  private decals: DecalEntry[] = []
  private selectedId: string | null = null

  private raycaster = new THREE.Raycaster()
  private pointer = new THREE.Vector2()
  private orientHelper = new THREE.Object3D()

  private frameId = 0
  private resizeObserver: ResizeObserver
  private disposed = false

  // Estado del gesto de puntero en curso.
  private downAt: { x: number; y: number } | null = null
  private draggingId: string | null = null

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

  /** Carga el .glb del modelo, o arma el maniquí de primitivas si no tiene. */
  async loadModel(model: BodyModel): Promise<void> {
    this.clearBody()
    this.decalDepth = model.decalDepth

    let geometry: THREE.BufferGeometry
    if (model.file) {
      try {
        geometry = await this.loadGeometry(model.file)
        // glTF ya es Y-up; un .obj de Blender/Max suele venir Z-up (tumbado).
        if (model.orientation === 'z-up') geometry.rotateX(-Math.PI / 2)
      } catch {
        this.callbacks.onError?.(
          `No pudimos cargar ${model.file}. Se muestra el maniquí de referencia.`,
        )
        geometry = buildMannequinGeometry()
      }
    } else {
      geometry = buildMannequinGeometry()
    }
    if (this.disposed) {
      geometry.dispose()
      return
    }

    normalizeGeometry(geometry)

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

    this.setCamera(model.camera)
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
    this.controls.update()
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
      opacity: input.opacity ?? 1,
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
    }
    this.decals.push(entry)
  }

  updatePlacement(
    id: string,
    patch: Partial<{
      position: [number, number, number]
      quaternion: [number, number, number, number]
      size: [number, number, number]
      opacity: number
    }>,
  ) {
    const entry = this.decals.find((d) => d.id === id)
    if (!entry) return

    if (patch.opacity !== undefined) entry.material.opacity = patch.opacity
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

      const euler = new THREE.Euler().setFromQuaternion(entry.quaternion)
      let geometry: THREE.BufferGeometry
      try {
        geometry = new DecalGeometry(this.bodyMesh, entry.position, euler, entry.size)
      } catch {
        continue
      }
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

  private updatePointer(e: PointerEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
    this.raycaster.setFromCamera(this.pointer, this.camera)
  }

  private onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0 || !this.bodyMesh) return
    this.downAt = { x: e.clientX, y: e.clientY }
    this.updatePointer(e)

    // Primero las calcas: si se pincha una, se selecciona y se puede arrastrar.
    const meshes = this.decals.map((d) => d.mesh)
    const onDecal = meshes.length ? this.raycaster.intersectObjects(meshes, false)[0] : undefined
    if (onDecal) {
      const id = onDecal.object.name.replace('decal:', '')
      this.selectedId = id
      this.draggingId = id
      this.controls.enabled = false
      this.callbacks.onSelect?.(id)
    }
  }

  private onPointerMove = (e: PointerEvent) => {
    if (!this.draggingId || !this.bodyMesh) return
    this.updatePointer(e)
    const hit = this.raycaster.intersectObject(this.bodyMesh, false)[0]
    if (!hit || !hit.face) return

    const entry = this.decals.find((d) => d.id === this.draggingId)
    if (!entry) return

    const normal = hit.face.normal
      .clone()
      .applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(this.bodyMesh.matrixWorld))
      .normalize()
    entry.position.copy(hit.point)
    entry.quaternion.set(...this.orientationFor(normal.toArray() as [number, number, number]))
    entry.dirty = true
  }

  private onPointerUp = (e: PointerEvent) => {
    const wasDragging = this.draggingId
    this.controls.enabled = true
    this.draggingId = null

    if (wasDragging) {
      const entry = this.decals.find((d) => d.id === wasDragging)
      if (entry) {
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
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > CLICK_SLOP) return

    this.updatePointer(e)
    const hit = this.raycaster.intersectObject(this.bodyMesh, false)[0]
    if (!hit || !hit.face) {
      if (this.selectedId) {
        this.selectedId = null
        this.callbacks.onSelect?.(null)
      }
      return
    }

    const normal = hit.face.normal
      .clone()
      .applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(this.bodyMesh.matrixWorld))
      .normalize()

    this.callbacks.onPlace?.({
      point: hit.point.toArray() as [number, number, number],
      normal: normal.toArray() as [number, number, number],
      faceIndex: hit.faceIndex ?? -1,
      uv: hit.uv ? ([hit.uv.x, hit.uv.y] as [number, number]) : null,
    })
  }

  /** Profundidad del proyector para el modelo/zona activos. */
  get projectorDepth(): number {
    return this.decalDepth
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
 * Deja la geometría centrada en X/Z, con los pies en y=0 y a estatura estándar,
 * horneando la transformación. Así el objeto queda en la identidad y el espacio
 * del mundo coincide con el del modelo: las coordenadas guardadas son estables.
 */
function normalizeGeometry(geometry: THREE.BufferGeometry) {
  geometry.computeBoundingBox()
  const box = geometry.boundingBox
  if (!box) return

  const size = new THREE.Vector3()
  box.getSize(size)
  const height = size.y || 1
  const scale = TARGET_HEIGHT / height

  const center = new THREE.Vector3()
  box.getCenter(center)

  const m = new THREE.Matrix4()
    .makeScale(scale, scale, scale)
    .multiply(new THREE.Matrix4().makeTranslation(-center.x, -box.min.y, -center.z))
  geometry.applyMatrix4(m)
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
}

/**
 * Maniquí de referencia con primitivas, para poder usar (y probar) el módulo
 * antes de tener el .glb real. Se fusiona en una sola geometría porque
 * `DecalGeometry` necesita una única malla.
 */
function buildMannequinGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []

  const add = (geo: THREE.BufferGeometry, x: number, y: number, z: number, rotZ = 0, rotX = 0) => {
    const m = new THREE.Matrix4().makeTranslation(x, y, z)
    if (rotZ) m.multiply(new THREE.Matrix4().makeRotationZ(rotZ))
    if (rotX) m.multiply(new THREE.Matrix4().makeRotationX(rotX))
    geo.applyMatrix4(m)
    parts.push(geo.toNonIndexed())
  }

  // Torso, cadera, cuello y cabeza.
  add(new THREE.CapsuleGeometry(0.2, 0.42, 12, 32), 0, 1.32, 0)
  add(new THREE.CapsuleGeometry(0.17, 0.12, 10, 28), 0, 1.0, 0)
  add(new THREE.CylinderGeometry(0.06, 0.07, 0.12, 20), 0, 1.63, 0)
  add(new THREE.SphereGeometry(0.115, 28, 22), 0, 1.76, 0)

  // Hombros y brazos (ligeramente abiertos).
  for (const s of [1, -1]) {
    add(new THREE.SphereGeometry(0.075, 20, 16), s * 0.21, 1.5, 0)
    add(new THREE.CapsuleGeometry(0.055, 0.26, 10, 24), s * 0.28, 1.31, 0, s * 0.16)
    add(new THREE.CapsuleGeometry(0.046, 0.25, 10, 24), s * 0.35, 1.02, 0, s * 0.1)
    add(new THREE.SphereGeometry(0.05, 16, 14), s * 0.39, 0.85, 0)
  }

  // Piernas.
  for (const s of [1, -1]) {
    add(new THREE.CapsuleGeometry(0.085, 0.3, 10, 24), s * 0.1, 0.72, 0)
    add(new THREE.CapsuleGeometry(0.065, 0.3, 10, 24), s * 0.1, 0.32, 0)
    add(new THREE.SphereGeometry(0.07, 16, 14), s * 0.1, 0.07, 0.02)
  }

  const merged = mergeGeometries(parts, false)
  parts.forEach((p) => p.dispose())
  if (!merged) throw new Error('No se pudo construir el maniquí.')
  merged.computeVertexNormals()
  return merged
}
