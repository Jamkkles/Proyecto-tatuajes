import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../lib/api'
import { useAppShellHeader } from '../lib/useAppShellHeader'
import {
  ALLOWED_MIME,
  MAX_FILE_BYTES,
  createSketch,
  formatSize,
  listSketches,
  type Sketch,
} from '../lib/sketches'
import {
  DEFAULT_MODEL_ID,
  DEFAULT_TATTOO_SIZE,
  MIN_TATTOO_SIZE,
  PART_LABEL,
  PART_ORDER,
  SEXES,
  bodyModelId,
  isStaleModelId,
  maxTattooSize,
  resolveBodyModel,
} from '../lib/bodyModels'
import {
  createPreview,
  deletePreview,
  getPreview,
  listPreviews,
  updatePreview,
  type Preview,
  type PreviewPlacement,
} from '../lib/previews'
import { viewerIcons } from '../components/icons'
import type { HitInfo, TattooViewer } from '../lib/tattooViewer'
import './Preview3D.css'

/** Un tatuaje colocado, tal como lo ve el panel. El 3D vive en el visor. */
interface Placed {
  id: string
  /** Boceto de la galería. Los archivos locales se suben antes de colocarse,
   *  así que aquí siempre hay un id real y la escena se puede guardar. */
  sketchId: string
  title: string
  /** URL que se pasa al visor (puede ser un blob: ya procesado). */
  textureUrl: string
  /** URL original, para volver a procesarla si cambia el recorte de fondo. */
  sourceUrl: string
  /** Ancho/alto de la imagen, para no deformar el tatuaje. */
  aspect: number
  position: [number, number, number]
  quaternion: [number, number, number, number]
  size: [number, number, number]
  anchor: { faceIndex: number | null; uv: [number, number] | null } | null
  opacity: number
}

/** Boceto listo para colocar en el siguiente clic sobre el cuerpo. */
interface ArmedSketch {
  sketchId: string
  title: string
  url: string
  aspect: number
}

/**
 * Convierte el blanco del papel en transparencia. Los bocetos escaneados suelen
 * ser líneas negras sobre fondo blanco sin canal alfa; pegados tal cual se ven
 * como un recorte de papel sobre la piel.
 *
 * Lee píxeles, así que la imagen debe venir con CORS (el backend responde con
 * `Access-Control-Allow-Origin: *` también en /uploads).
 */
function removeWhiteBackground(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('sin contexto 2d'))

      ctx.drawImage(img, 0, 0)
      let data: ImageData
      try {
        data = ctx.getImageData(0, 0, canvas.width, canvas.height)
      } catch {
        // Lienzo contaminado: la imagen no llegó con cabeceras CORS.
        return reject(new Error('cors'))
      }

      const px = data.data
      for (let i = 0; i < px.length; i += 4) {
        const luma = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]
        // El alfa sigue a la tinta: blanco → transparente, negro → opaco.
        px[i + 3] = Math.min(px[i + 3], 255 - luma)
      }
      ctx.putImageData(data, 0, 0)
      canvas.toBlob((blob) => {
        if (blob) resolve(URL.createObjectURL(blob))
        else reject(new Error('sin blob'))
      }, 'image/png')
    }
    img.onerror = () => reject(new Error('carga'))
    img.src = url
  })
}

function imageAspect(url: string): Promise<number> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img.naturalWidth / Math.max(1, img.naturalHeight))
    img.onerror = () => resolve(1)
    img.src = url
  })
}

export default function Preview3D() {
  const stageRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<TattooViewer | null>(null)
  /** URLs de blob creadas aquí, para revocarlas al desmontar. */
  const blobUrlsRef = useRef<string[]>([])

  /**
   * Último id que se mandó cargar al visor. `openScene` carga el modelo él
   * mismo antes de restaurar las calcas; sin esta marca el efecto de abajo lo
   * cargaría otra vez en paralelo, dejando dos cuerpos en escena y borrando
   * las calcas a medio restaurar.
   */
  const loadedModelIdRef = useRef<string | null>(null)

  const [ready, setReady] = useState(false)
  const [modelId, setModelId] = useState(DEFAULT_MODEL_ID)
  const [zoneId, setZoneId] = useState<string | null>(null)
  const [triangles, setTriangles] = useState<number | null>(null)

  const [sketches, setSketches] = useState<Sketch[]>([])
  const [source, setSource] = useState<'galeria' | 'archivo'>('galeria')
  const [armed, setArmed] = useState<ArmedSketch | null>(null)
  const [uploading, setUploading] = useState(false)
  const [cleanBackground, setCleanBackground] = useState(true)

  const [placed, setPlaced] = useState<Placed[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const [sceneName, setSceneName] = useState('')
  const [sceneId, setSceneId] = useState<string | null>(null)
  const [scenes, setScenes] = useState<Preview[]>([])
  const [openId, setOpenId] = useState('')
  const [saving, setSaving] = useState(false)
  const [opening, setOpening] = useState(false)
  const [notice, setNotice] = useState('')

  // El sexo y la parte se leen del modelo, no de un estado aparte: así abrir
  // una escena guardada deja los botones sincronizados sin trabajo extra.
  const model = resolveBodyModel(modelId)
  const sizeMax = maxTattooSize(model)
  const selected = placed.find((p) => p.id === selectedId) ?? null

  useAppShellHeader({
    title: 'Previsualización 3D',
    subtitle: sceneName.trim() || `${placed.length} ${placed.length === 1 ? 'tatuaje' : 'tatuajes'}`,
  })

  /* --------- Datos: bocetos y escenas guardadas --------- */
  useEffect(() => {
    listSketches().then(setSketches).catch(() => setSketches([]))
    listPreviews().then(setScenes).catch(() => setScenes([]))
  }, [])

  /* --------- Handlers vivos para el visor ---------
     El visor se crea una sola vez; lee los callbacks de este ref para no tener
     que recrearse cada vez que cambia el estado. */
  const handlersRef = useRef<{ onPlace: (hit: HitInfo) => void }>({ onPlace: () => {} })

  const placeAt = useCallback(
    (hit: HitInfo) => {
      const viewer = viewerRef.current
      if (!viewer) return
      if (!armed) {
        setNotice('Elige primero un boceto en el panel de la derecha.')
        return
      }

      const depth = viewer.projectorDepth
      const w = DEFAULT_TATTOO_SIZE
      const h = DEFAULT_TATTOO_SIZE / armed.aspect
      const entry: Placed = {
        id: crypto.randomUUID(),
        sketchId: armed.sketchId,
        title: armed.title,
        textureUrl: armed.url,
        sourceUrl: armed.url,
        aspect: armed.aspect,
        position: hit.point,
        quaternion: viewer.orientationFor(hit.normal),
        size: [w, h, depth],
        anchor: { faceIndex: hit.faceIndex, uv: hit.uv },
        opacity: 1,
      }

      viewer.addPlacement({
        id: entry.id,
        textureUrl: entry.textureUrl,
        position: entry.position,
        quaternion: entry.quaternion,
        size: entry.size,
      })
      setPlaced((list) => [...list, entry])
      setSelectedId(entry.id)
      setNotice('')
    },
    [armed],
  )

  useEffect(() => {
    handlersRef.current.onPlace = placeAt
  })

  /* --------- Ciclo de vida del visor --------- */
  useEffect(() => {
    const host = stageRef.current
    if (!host) return

    let cancelled = false
    let viewer: TattooViewer | null = null

    // three.js se carga aquí para que el panel pinte de inmediato.
    import('../lib/tattooViewer')
      .then(({ TattooViewer: Viewer }) => {
        if (cancelled || !stageRef.current) return
        viewer = new Viewer(stageRef.current, {
          onPlace: (hit) => handlersRef.current.onPlace(hit),
          onSelect: (id) => setSelectedId(id),
          onTransform: (id, t) =>
            setPlaced((list) =>
              list.map((p) =>
                p.id === id ? { ...p, position: t.position, quaternion: t.quaternion } : p,
              ),
            ),
          // 0 = el modelo no cargó; mejor que no salga insignia a que muestre
          // la del modelo anterior.
          onModelLoaded: ({ triangles: n }) => setTriangles(n > 0 ? n : null),
          onError: (message) => setNotice(message),
        })
        viewerRef.current = viewer
        setReady(true)
      })
      .catch(() => setNotice('No pudimos iniciar el visor 3D en este navegador.'))

    return () => {
      cancelled = true
      viewer?.dispose()
      viewerRef.current = null
      loadedModelIdRef.current = null
      setReady(false)
    }
  }, [])

  /* --------- Carga del modelo --------- */
  useEffect(() => {
    if (!ready) return
    const viewer = viewerRef.current
    if (!viewer) return
    // Ya lo cargó `openScene`: recargarlo aquí duplicaría el cuerpo en escena.
    if (loadedModelIdRef.current === modelId) return
    loadedModelIdRef.current = modelId
    viewer.loadModel(resolveBodyModel(modelId))
    // Cambiar de cuerpo descarta las calcas: el espacio del modelo es otro.
    setPlaced([])
    setSelectedId(null)
    setZoneId(null)
  }, [ready, modelId])

  /* --------- Revocar blobs al desmontar --------- */
  useEffect(
    () => () => {
      blobUrlsRef.current.forEach((u) => URL.revokeObjectURL(u))
      blobUrlsRef.current = []
    },
    [],
  )

  /* --------- Preparar un boceto para colocarlo --------- */
  const armSketch = useCallback(
    async (sketchId: string, title: string, rawUrl: string) => {
      let url = rawUrl
      if (cleanBackground) {
        try {
          url = await removeWhiteBackground(rawUrl)
          blobUrlsRef.current.push(url)
        } catch {
          setNotice('No se pudo quitar el fondo; se usa la imagen original.')
          url = rawUrl
        }
      }
      const aspect = await imageAspect(url)
      setArmed({ sketchId, title, url, aspect })
    },
    [cleanBackground],
  )

  /**
   * Una imagen subida en el momento se guarda como boceto de la galería (mismo
   * endpoint que la página de Bocetos). Así persiste, aparece en la galería y
   * la escena que la use se puede guardar. Antes se quedaba solo en memoria y
   * desaparecía al recargar.
   */
  async function onPickFile(file: File | undefined) {
    if (!file) return
    if (!ALLOWED_MIME.includes(file.type)) {
      setNotice('Formato no permitido. Usa JPG, PNG, WEBP o GIF.')
      return
    }
    if (file.size > MAX_FILE_BYTES) {
      setNotice(`La imagen pesa ${formatSize(file.size)}; el máximo es 5 MB.`)
      return
    }

    const title = file.name.replace(/\.[^.]+$/, '') || 'Boceto sin título'
    setUploading(true)
    setNotice('')
    try {
      const sketch = await createSketch({ file, title })
      setSketches((list) => [sketch, ...list])
      setSource('galeria')
      await armSketch(sketch.id, sketch.title, sketch.url)
      setNotice(`«${sketch.title}» se añadió a tu galería.`)
    } catch (err) {
      setNotice(
        err instanceof ApiError ? err.message : 'No pudimos subir la imagen. Inténtalo de nuevo.',
      )
    } finally {
      setUploading(false)
    }
  }

  /* --------- Edición del tatuaje seleccionado --------- */
  function changeSize(raw: number) {
    if (!selected) return
    // El tope depende de la pieza: en una cabeza de 26 cm el máximo global de
    // 60 cm daría una caja de proyección mayor que el propio modelo.
    const width = Math.min(Math.max(raw, MIN_TATTOO_SIZE), sizeMax)
    const size: [number, number, number] = [width, width / selected.aspect, selected.size[2]]
    viewerRef.current?.updatePlacement(selected.id, { size })
    setPlaced((l) => l.map((p) => (p.id === selected.id ? { ...p, size } : p)))
  }

  function changeDepth(depth: number) {
    if (!selected) return
    const size: [number, number, number] = [selected.size[0], selected.size[1], depth]
    viewerRef.current?.updatePlacement(selected.id, { size })
    setPlaced((l) => l.map((p) => (p.id === selected.id ? { ...p, size } : p)))
  }

  function roll(deg: number) {
    if (!selected) return
    const q = viewerRef.current?.rollPlacement(selected.id, (deg * Math.PI) / 180)
    if (q) setPlaced((l) => l.map((p) => (p.id === selected.id ? { ...p, quaternion: q } : p)))
  }

  function changeOpacity(opacity: number) {
    if (!selected) return
    viewerRef.current?.updatePlacement(selected.id, { opacity })
    setPlaced((l) => l.map((p) => (p.id === selected.id ? { ...p, opacity } : p)))
  }

  function removePlaced(id: string) {
    viewerRef.current?.removePlacement(id)
    setPlaced((l) => l.filter((p) => p.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  function selectPlaced(id: string | null) {
    setSelectedId(id)
    viewerRef.current?.select(id)
  }

  /* --------- Zonas y cámara --------- */
  function goToZone(id: string | null) {
    const viewer = viewerRef.current
    if (!viewer) return
    setZoneId(id)
    if (!id) {
      viewer.setCamera(model.camera)
      viewer.setProjectorDepth(model.decalDepth)
      return
    }
    const zone = model.zones.find((z) => z.id === id)
    if (!zone) return
    viewer.setCamera(zone.camera)
    viewer.setProjectorDepth(zone.decalDepth)
  }

  /* --------- Guardar / abrir escenas --------- */
  async function saveScene() {
    const viewer = viewerRef.current
    if (!viewer) return
    if (!sceneName.trim()) {
      setNotice('Ponle un nombre a la previsualización.')
      return
    }

    const payload = {
      name: sceneName.trim(),
      modelId,
      camera: viewer.getCameraPreset(),
      placements: placed.map<PreviewPlacement>((p, i) => ({
        sketchId: p.sketchId,
        position: p.position,
        quaternion: p.quaternion,
        size: p.size,
        anchor: p.anchor,
        render: { order: i, opacity: p.opacity, flipX: false },
      })),
    }

    setSaving(true)
    try {
      const saved = sceneId
        ? await updatePreview(sceneId, payload)
        : await createPreview(payload)
      setSceneId(saved.id)
      setScenes(await listPreviews())
      setNotice('Previsualización guardada.')
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : 'No pudimos guardar la previsualización.')
    } finally {
      setSaving(false)
    }
  }

  async function openScene(id: string) {
    const viewer = viewerRef.current
    if (!viewer || !id) return

    setOpening(true)
    // Se limpia primero: restaurar es asíncrono (una textura por tatuaje) y si
    // no, el panel mostraría un rato la escena anterior mezclada con la nueva.
    placed.forEach((p) => viewerRef.current?.removePlacement(p.id))
    setPlaced([])
    setSelectedId(null)

    try {
      const scene = await getPreview(id)
      const list = sketches.length ? sketches : await listSketches()
      if (sketches.length === 0) setSketches(list)

      // Se guarda el id ya resuelto, no el crudo: si la escena viene del
      // catálogo viejo, el estado tiene que quedar en un id que exista o no se
      // marcaría ningún botón.
      const target = resolveBodyModel(scene.model_id)
      setModelId(target.id)
      // El modelo lo carga esta función; que el efecto no lo cargue otra vez.
      loadedModelIdRef.current = target.id
      setSceneId(scene.id)
      setSceneName(scene.name)
      setZoneId(null)

      await viewer.loadModel(target)
      if (scene.camera) viewer.setCamera(scene.camera)

      const restored: Placed[] = []
      for (const p of scene.placements) {
        const sketch = list.find((s) => s.id === p.sketchId)
        if (!sketch) continue
        let url = sketch.url
        if (cleanBackground) {
          try {
            url = await removeWhiteBackground(sketch.url)
            blobUrlsRef.current.push(url)
          } catch {
            url = sketch.url
          }
        }
        const entry: Placed = {
          id: crypto.randomUUID(),
          sketchId: p.sketchId,
          title: sketch.title,
          textureUrl: url,
          sourceUrl: sketch.url,
          aspect: p.size[1] > 0 ? p.size[0] / p.size[1] : 1,
          position: p.position,
          quaternion: p.quaternion,
          size: p.size,
          anchor: p.anchor,
          opacity: p.render?.opacity ?? 1,
        }
        await viewer.addPlacement({
          id: entry.id,
          textureUrl: entry.textureUrl,
          position: entry.position,
          quaternion: entry.quaternion,
          size: entry.size,
          opacity: entry.opacity,
        })
        restored.push(entry)
      }
      setPlaced(restored)
      setSelectedId(null)
      setNotice(
        isStaleModelId(scene.model_id)
          ? `Abierta «${scene.name}». Se hizo sobre el maniquí, que ya no existe: revisa dónde quedaron los tatuajes.`
          : `Abierta «${scene.name}».`,
      )
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : 'No pudimos abrir la previsualización.')
    } finally {
      setOpening(false)
    }
  }

  async function removeScene(id: string) {
    if (!window.confirm('¿Eliminar esta previsualización guardada?')) return
    try {
      await deletePreview(id)
      setScenes((l) => l.filter((s) => s.id !== id))
      if (sceneId === id) setSceneId(null)
      setOpenId('')
      setNotice('Previsualización eliminada.')
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : 'No pudimos eliminarla.')
    }
  }

  function newScene() {
    placed.forEach((p) => viewerRef.current?.removePlacement(p.id))
    setPlaced([])
    setSelectedId(null)
    setSceneId(null)
    setSceneName('')
    setNotice('')
  }

  async function downloadPng() {
    const blob = await viewerRef.current?.snapshot()
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${sceneName.trim() || 'previsualizacion'}.png`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="prev3d">
      {/* ---------- Lienzo 3D ---------- */}
      <section className="prev3d__stage" aria-label="Vista 3D">
        <div className="prev3d__canvas" ref={stageRef} />

        {!ready && <p className="prev3d__loading">Cargando visor 3D…</p>}

        <div className="prev3d__toolbar" role="toolbar" aria-label="Navegación 3D">
          <button type="button" className="prev3d__tool" aria-label="Acercar"
            onClick={() => viewerRef.current?.zoom(0.8)}>
            {viewerIcons.zoomIn}
          </button>
          <button type="button" className="prev3d__tool" aria-label="Alejar"
            onClick={() => viewerRef.current?.zoom(1.25)}>
            {viewerIcons.zoomOut}
          </button>
          <button type="button" className="prev3d__tool" aria-label="Girar 90°"
            onClick={() => viewerRef.current?.orbit(Math.PI / 2)}>
            {viewerIcons.rotate}
          </button>
          <span className="prev3d__tool-sep" aria-hidden="true" />
          <button type="button" className="prev3d__tool" aria-label="Subir la vista"
            onClick={() => viewerRef.current?.orbit(0, -0.25)}>
            {viewerIcons.panUp}
          </button>
          <button type="button" className="prev3d__tool" aria-label="Bajar la vista"
            onClick={() => viewerRef.current?.orbit(0, 0.25)}>
            {viewerIcons.panDown}
          </button>
          <span className="prev3d__tool-sep" aria-hidden="true" />
          <button type="button" className="prev3d__tool" aria-label="Encuadrar el modelo"
            onClick={() => goToZone(zoneId)}>
            {viewerIcons.frame}
          </button>
        </div>

        <span className="prev3d__hint">
          {armed
            ? `Haz clic sobre el modelo para colocar «${armed.title}»`
            : 'Arrastra para girar · rueda para acercar'}
        </span>

        {triangles !== null && (
          <span className="prev3d__meta">{triangles.toLocaleString('es-CL')} triángulos</span>
        )}
      </section>

      {/* ---------- Panel ---------- */}
      <aside className="prev3d__panel">
        {notice && (
          <p className="prev3d__notice" role="status" onAnimationEnd={() => setNotice('')}>
            {notice}
          </p>
        )}

        {/* Modelo y zona */}
        <section className="prev3d__block">
          <h2 className="prev3d__h">Cuerpo</h2>
          <div className="prev3d__tabs" role="tablist" aria-label="Sexo del modelo">
            {SEXES.map((s) => (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={model.sex === s.id}
                className={`prev3d__tab${model.sex === s.id ? ' prev3d__tab--on' : ''}`}
                onClick={() => setModelId(bodyModelId(s.id, model.part))}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="prev3d__chips" role="group" aria-label="Parte del cuerpo">
            {PART_ORDER.map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={model.part === p}
                className={`prev3d__chip${model.part === p ? ' prev3d__chip--on' : ''}`}
                onClick={() => setModelId(bodyModelId(model.sex, p))}
              >
                {PART_LABEL[p]}
              </button>
            ))}
          </div>

          {model.zones.length > 0 && (
            <>
              <p className="prev3d__sub">Encuadre</p>
              <div className="prev3d__chips">
                <button
                  type="button"
                  className={`prev3d__chip${zoneId === null ? ' prev3d__chip--on' : ''}`}
                  onClick={() => goToZone(null)}
                >
                  General
                </button>
                {model.zones.map((z) => (
                  <button
                    key={z.id}
                    type="button"
                    className={`prev3d__chip${zoneId === z.id ? ' prev3d__chip--on' : ''}`}
                    onClick={() => goToZone(z.id)}
                  >
                    {z.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </section>

        {/* Boceto */}
        <section className="prev3d__block">
          <h2 className="prev3d__h">Boceto</h2>
          <div className="prev3d__tabs" role="tablist">
            <button type="button" role="tab" aria-selected={source === 'galeria'}
              className={`prev3d__tab${source === 'galeria' ? ' prev3d__tab--on' : ''}`}
              onClick={() => setSource('galeria')}>
              Galería
            </button>
            <button type="button" role="tab" aria-selected={source === 'archivo'}
              className={`prev3d__tab${source === 'archivo' ? ' prev3d__tab--on' : ''}`}
              onClick={() => setSource('archivo')}>
              Archivo
            </button>
          </div>

          {source === 'galeria' ? (
            sketches.length === 0 ? (
              <p className="prev3d__empty">Aún no tienes bocetos en la galería.</p>
            ) : (
              <ul className="prev3d__grid">
                {sketches.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      className={`prev3d__thumb${armed?.sketchId === s.id ? ' prev3d__thumb--on' : ''}`}
                      onClick={() => armSketch(s.id, s.title, s.url)}
                      title={s.title}
                    >
                      <img src={s.url} alt={s.title} loading="lazy" />
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <>
              <label className={`prev3d__file${uploading ? ' prev3d__file--busy' : ''}`}>
                <input
                  type="file"
                  accept={ALLOWED_MIME.join(',')}
                  disabled={uploading}
                  onChange={(e) => onPickFile(e.target.files?.[0])}
                />
                {uploading ? 'Subiendo…' : 'Elegir imagen del equipo'}
              </label>
              <p className="prev3d__hintline">
                La imagen se añade a tu galería, así queda guardada y puedes
                reutilizarla. JPG · PNG · WEBP · GIF — hasta 5 MB.
              </p>
            </>
          )}

          <label className="prev3d__check">
            <input
              type="checkbox"
              checked={cleanBackground}
              onChange={(e) => setCleanBackground(e.target.checked)}
            />
            Quitar el fondo blanco del boceto
          </label>
        </section>

        {/* Tatuajes colocados */}
        <section className="prev3d__block">
          <h2 className="prev3d__h">
            Tatuajes <span className="prev3d__count">{placed.length}</span>
          </h2>

          {opening ? (
            <p className="prev3d__empty">Restaurando los tatuajes…</p>
          ) : placed.length === 0 ? (
            <p className="prev3d__empty">
              Elige un boceto y haz clic sobre el modelo para colocarlo.
            </p>
          ) : (
            <ul className="prev3d__layers">
              {placed.map((p) => (
                <li
                  key={p.id}
                  className={`prev3d__layer${p.id === selectedId ? ' prev3d__layer--on' : ''}`}
                >
                  <button type="button" className="prev3d__layer-pick" onClick={() => selectPlaced(p.id)}>
                    <img src={p.textureUrl} alt="" />
                    <span className="prev3d__layer-name">{p.title}</span>
                  </button>
                  <button
                    type="button"
                    className="prev3d__layer-del"
                    onClick={() => removePlaced(p.id)}
                    aria-label={`Quitar ${p.title}`}
                  >
                    {viewerIcons.trash}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {selected && (
            <div className="prev3d__controls">
              <label className="prev3d__range">
                <span>Tamaño <b>{Math.round(selected.size[0] * 100)} cm</b></span>
                <input
                  type="range"
                  min={MIN_TATTOO_SIZE * 100}
                  max={sizeMax * 100}
                  step={0.5}
                  value={selected.size[0] * 100}
                  onChange={(e) => changeSize(Number(e.target.value) / 100)}
                />
              </label>

              <label className="prev3d__range">
                <span>Profundidad <b>{Math.round(selected.size[2] * 100)} cm</b></span>
                <input
                  type="range"
                  min={2}
                  max={50}
                  step={1}
                  value={selected.size[2] * 100}
                  onChange={(e) => changeDepth(Number(e.target.value) / 100)}
                />
              </label>

              <div className="prev3d__row">
                <span>Rotar</span>
                <button type="button" className="prev3d__mini" onClick={() => roll(-15)}>−15°</button>
                <button type="button" className="prev3d__mini" onClick={() => roll(15)}>+15°</button>
                <button type="button" className="prev3d__mini" onClick={() => roll(90)}>+90°</button>
              </div>

              <label className="prev3d__range">
                <span>Opacidad <b>{Math.round(selected.opacity * 100)}%</b></span>
                <input
                  type="range" min={10} max={100} step={5}
                  value={selected.opacity * 100}
                  onChange={(e) => changeOpacity(Number(e.target.value) / 100)}
                />
              </label>
            </div>
          )}
        </section>

        {/* Escena */}
        <section className="prev3d__block">
          <h2 className="prev3d__h">Previsualización</h2>

          <input
            className="prev3d__input"
            value={sceneName}
            onChange={(e) => setSceneName(e.target.value)}
            placeholder="Nombre (p. ej. Diseño para Camila)"
            aria-label="Nombre de la previsualización"
          />

          <div className="prev3d__actions">
            <button type="button" className="prev3d__btn prev3d__btn--primary"
              onClick={saveScene} disabled={saving || placed.length === 0}>
              {viewerIcons.save}
              {saving ? 'Guardando…' : sceneId ? 'Actualizar' : 'Guardar'}
            </button>
            <button type="button" className="prev3d__btn" onClick={downloadPng} disabled={!ready}>
              {viewerIcons.camera} PNG
            </button>
            <button type="button" className="prev3d__btn" onClick={newScene}>Nueva</button>
          </div>

          {scenes.length > 0 && (
            <div className="prev3d__open">
              <select
                className="prev3d__select"
                value={openId}
                onChange={(e) => setOpenId(e.target.value)}
                aria-label="Previsualizaciones guardadas"
              >
                <option value="">Abrir guardada…</option>
                {scenes.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <button type="button" className="prev3d__btn" disabled={!openId || opening}
                onClick={() => openScene(openId)} aria-label="Abrir la previsualización elegida">
                {viewerIcons.folder}
              </button>
              <button type="button" className="prev3d__btn prev3d__btn--danger"
                disabled={!openId || opening}
                onClick={() => removeScene(openId)} aria-label="Eliminar la guardada">
                {viewerIcons.trash}
              </button>
            </div>
          )}
        </section>
      </aside>
    </div>
  )
}
