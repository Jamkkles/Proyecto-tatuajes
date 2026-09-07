/**
 * Convierte los `.obj` de `models-src/` en los `.glb` que sirve el visor 3D.
 *
 *   npm run models            # genera lo que falte
 *   npm run models -- --force # regenera todo, incluido lo que ya existe
 *   npm run models -- mujer-cabeza hombre-torso   # solo esos ids
 *
 * Las herramientas van por `npx` y NO en devDependencies: entre obj2gltf y
 * @gltf-transform/cli son ~100 MB en cada `npm ci` para una tarea que se corre
 * una vez cada vez que cambian los modelos.
 *
 * El nombre del archivo es el id del catálogo más el sufijo de versión
 * (`mujer-cabeza-v1.glb`). El sufijo es obligatorio: nginx sirve los `.glb` con
 * `Cache-Control: immutable` a un año (ver `frontend/nginx.conf`), así que un
 * modelo corregido tiene que llamarse `-v2` o nadie que ya lo tenga lo verá.
 * Por eso el script nunca sobrescribe sin `--force`.
 */

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '..', '..')
const SRC = process.env.MODELS_SRC ?? path.join(REPO, 'models-src')
const OUT = path.join(REPO, 'frontend', 'public', 'models')

/**
 * Presupuesto: ~40k triángulos por pieza suelta, ~60k por cuerpo entero.
 *
 * `ratio` se aplica sobre los triángulos que salen de obj2gltf, no sobre las
 * líneas `f` del `.obj`: los originales son quads, así que cada línea da dos
 * triángulos y el conteo real es el doble del que se ve en el archivo. La
 * proporción se cumple con bastante exactitud — a `male.obj` (705 204 quads =
 * 1 410 408 triángulos) se le pidió 0.045 y salieron 63 463, que es justo lo
 * pedido. Así que para reajustar una pieza basta con regla de tres.
 *
 * `error` es un tope duro que puede cortar la simplificación antes de llegar a
 * `ratio`; es relativo al radio de la esfera envolvente, o sea invariante a la
 * escala. Las cabezas lo llevan más ajustado a propósito: una cabeza que llena
 * el viewport se mira con ~10× el tamaño angular de esa misma cabeza dentro de
 * un cuerpo entero, así que el mismo error relativo se nota 10× más.
 */
const MODELS = [
  { id: 'hombre-torso', src: 'Torzo.obj', ratio: 0.1, error: 0.015 },
  { id: 'hombre-brazo-izq', src: 'BrazoIzq.obj', ratio: 0.165, error: 0.015 },
  { id: 'hombre-brazo-der', src: 'BrazoDer.obj', ratio: 0.17, error: 0.015 },
  { id: 'hombre-pierna-izq', src: 'PiernaIzq.obj', ratio: 0.74, error: 0.015 },
  { id: 'hombre-pierna-der', src: 'PiernaDer.obj', ratio: 0.735, error: 0.015 },
  { id: 'hombre-cabeza', src: 'Cabeza.obj', ratio: 0.12, error: 0.01 },
  { id: 'mujer-cuerpo', src: 'Mujer.obj', ratio: 0.11, error: 0.015 },
  { id: 'mujer-torso', src: 'TorsoMujer.obj', ratio: 0.82, error: 0.015 },
  { id: 'mujer-brazo-izq', src: 'BrazoIzqMujer.obj', ratio: 0.73, error: 0.015 },
  { id: 'mujer-brazo-der', src: 'BrazoDerMujer.obj', ratio: 0.73, error: 0.015 },
  { id: 'mujer-pierna-izq', src: 'PiernaIzqMujer.obj', ratio: 0.62, error: 0.015 },
  { id: 'mujer-pierna-der', src: 'PiernaDerMujer.obj', ratio: 0.62, error: 0.015 },
  { id: 'mujer-cabeza', src: 'CabezaMujer.obj', ratio: 0.39, error: 0.008 },
]
// `hombre-cuerpo` no está en la lista: se sirve desde `male-v1.glb`, que ya
// estaba generado y versionado (ver FILE_OVERRIDE en `src/lib/bodyModels.ts`).

const args = process.argv.slice(2)
const force = args.includes('--force')
const only = args.filter((a) => !a.startsWith('--'))

// `male.obj` y `Mujer.obj` pasan de 40 MB: obj2gltf revienta el heap por defecto.
const ENV = { ...process.env, NODE_OPTIONS: '--max-old-space-size=8192' }

function run(cmd, argv) {
  execFileSync(cmd, argv, { stdio: 'inherit', env: ENV, shell: process.platform === 'win32' })
}

const gltf = (...argv) => run('npx', ['--yes', '@gltf-transform/cli@4', ...argv])

/** Triángulos y bytes del `.glb`, leyendo su cabecera JSON. */
function inspect(file) {
  const buf = fs.readFileSync(file)
  const jsonLength = buf.readUInt32LE(12)
  const json = JSON.parse(buf.subarray(20, 20 + jsonLength).toString('utf8'))
  let tris = 0
  for (const mesh of json.meshes ?? []) {
    for (const prim of mesh.primitives ?? []) {
      const acc = json.accessors[prim.indices ?? prim.attributes.POSITION]
      tris += acc.count / 3
    }
  }
  return { tris: Math.round(tris), bytes: buf.length }
}

/**
 * Triángulos del `.obj` de origen, para poder comparar antes y después. No es
 * el número de líneas `f`: estos originales son quads, y una cara de n
 * vértices se triangula en n-2.
 */
function countSourceTris(file) {
  let n = 0
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (line.startsWith('f ')) n += line.trim().split(/\s+/).length - 3
  }
  return n
}

/**
 * Reescribe el `.obj` dejando solo posiciones y caras: fuera `vn`, `vt` y los
 * índices de esas listas en las caras (`f 1/2/3` → `f 1`).
 *
 * Sin esto el pipeline no reduce nada. `weld` solo fusiona vértices **bitwise
 * idénticos** (no tiene tolerancia en la v4), y estos originales traen normales
 * por cara: dos triángulos que comparten una esquina tienen ahí normales
 * distintas, así que no se fusiona ni un vértice, la malla queda sin aristas
 * compartidas y `simplify` no encuentra nada que colapsar. Se notaba en que un
 * brazo acababa pesando 14 MB. `male.obj` era el único que ya funcionaba, y es
 * justamente el único que venía sin `vn`/`vt`.
 *
 * Las normales no se pierden: al no traerlas el `.glb`, el visor las calcula
 * con la geometría todavía indexada (`extractGeometry` en `tattooViewer.ts`),
 * o sea promediando entre caras vecinas — sombreado suave, que es lo que
 * queremos. Las UV tampoco hacen falta: la calca se proyecta con
 * `DecalGeometry`, no por UV.
 */
function stripToPositions(src, dst) {
  const out = []
  for (const line of fs.readFileSync(src, 'utf8').split('\n')) {
    if (line.startsWith('v ') || line.startsWith('o ') || line.startsWith('g ')) {
      out.push(line)
    } else if (line.startsWith('f ')) {
      const idx = line.trim().split(/\s+/).slice(1).map((t) => t.split('/')[0])
      out.push(`f ${idx.join(' ')}`)
    }
  }
  fs.writeFileSync(dst, out.join('\n'))
}

function build(model, tmp) {
  const src = path.join(SRC, model.src)
  if (!fs.existsSync(src)) throw new Error(`No está el original: ${src}`)

  const step = (name) => path.join(tmp, `${model.id}-${name}.glb`)
  const dst = path.join(OUT, `${model.id}-v1.glb`)

  const bare = path.join(tmp, `${model.id}-bare.obj`)
  stripToPositions(src, bare)
  run('npx', ['--yes', 'obj2gltf@3', '-i', bare, '-o', step('raw')])
  gltf('join', step('raw'), step('join'))
  // `weld` no es opcional ni aunque no se simplifique: obj2gltf emite geometría
  // sin índice, y `simplify` además exige una primitiva indexada.
  gltf('weld', step('join'), step('weld'))

  let last = step('weld')
  if (model.ratio) {
    gltf('simplify', last, step('simplify'), '--ratio', String(model.ratio), '--error', String(model.error))
    last = step('simplify')
  }

  // NO usar `--compress meshopt`: cuantiza POSITION y el visor lee mal la
  // escala. nginx ya sirve el .glb con gzip.
  gltf('optimize', last, dst, '--compress', 'false', '--texture-compress', 'false', '--simplify', 'false')

  return { ...inspect(dst), srcTris: countSourceTris(src) }
}

fs.mkdirSync(OUT, { recursive: true })
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ht-models-'))
const rows = []

try {
  for (const model of MODELS) {
    if (only.length && !only.includes(model.id)) continue
    const dst = path.join(OUT, `${model.id}-v1.glb`)
    if (fs.existsSync(dst) && !force) {
      rows.push({ modelo: model.id, ...inspect(dst), estado: 'ya existía' })
      continue
    }
    console.log(`\n=== ${model.id}  ←  ${model.src} ===`)
    rows.push({ modelo: model.id, ...build(model, tmp), estado: 'generado' })
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true })
}

console.log('\n')
console.table(
  rows.map((r) => ({
    modelo: r.modelo,
    'tris origen': r.srcTris ?? '—',
    triángulos: r.tris,
    KB: Math.round(r.bytes / 1024),
    estado: r.estado,
  })),
)

// El visor va sobrado hasta ~65k triángulos por pieza; por encima conviene
// bajar el `ratio` o subir el `error` y regenerar con --force.
const gordos = rows.filter((r) => r.tris > 65_000 || r.bytes > 1_500_000)
if (gordos.length) {
  console.warn(`\n⚠  Pasados de presupuesto: ${gordos.map((r) => r.modelo).join(', ')}`)
}
