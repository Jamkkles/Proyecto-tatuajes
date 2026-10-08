/**
 * Genera el logo transparente y todos los íconos de la app a partir de la
 * imagen original del logo.
 *
 *   node frontend/scripts/make-icons.cjs <logo-original.png>
 *
 * Con la imagen original reescribe `public/logo.png`; sin argumentos reutiliza
 * el que ya está y solo rehace los íconos. Usa el `sharp` del backend, porque el
 * frontend no lo trae.
 *
 * Qué hace con el original (blanco sobre fondo casi negro, sin transparencia):
 *  - Se queda con la mancha más grande y recorta a su caja: el original traía
 *    unos píxeles sueltos en una esquina, resto de un recorte, que ensuciarían
 *    el borde.
 *  - Pasa el negro a transparencia (alpha = brillo del píxel) y reajusta el
 *    color para que, puesto sobre negro, se vea exactamente igual. Así el logo
 *    sirve sobre cualquier fondo y la hoja de la aguja, que degrada del azul al
 *    negro, se funde con él.
 */
const fs = require('fs')
const path = require('path')
const sharp = require(path.resolve(__dirname, '../../backend/node_modules/sharp'))

const PUBLIC = path.resolve(__dirname, '../public')
const LOGO = path.join(PUBLIC, 'logo.png')
const BG = '#07080a' // el mismo del tema, del manifest y de theme-color
const BASE = 2 // el fondo del original es #020202

async function buildLogo(original) {
  const { data, info } = await sharp(original).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width: W, height: H, channels: C } = info
  const bright = (i) => Math.max(data[i * C], data[i * C + 1], data[i * C + 2])

  // Mancha conectada más grande (el logo), ignorando lo que no toca con ella.
  const label = new Int32Array(W * H)
  let best = { count: 0 }
  for (let s = 0, id = 0; s < W * H; s++) {
    if (label[s] || bright(s) <= 40) continue
    id++
    const stack = [s]
    label[s] = id
    const box = { id, count: 0, x0: W, y0: H, x1: 0, y1: 0 }
    while (stack.length) {
      const p = stack.pop()
      const x = p % W
      const y = (p / W) | 0
      box.count++
      box.x0 = Math.min(box.x0, x)
      box.x1 = Math.max(box.x1, x)
      box.y0 = Math.min(box.y0, y)
      box.y1 = Math.max(box.y1, y)
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
        const q = ny * W + nx
        if (!label[q] && bright(q) > 40) {
          label[q] = id
          stack.push(q)
        }
      }
    }
    if (box.count > best.count) best = box
  }
  // Todo lo que toca otra mancha (los píxeles sueltos) y su halo de 2 px se
  // descarta. El margen del recorte los deja dentro de la caja, así que no
  // basta con recortar.
  const drop = new Uint8Array(W * H)
  for (let p = 0; p < W * H; p++) {
    if (!label[p] || label[p] === best.id) continue
    const x = p % W
    const y = (p / W) | 0
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const nx = x + dx
        const ny = y + dy
        if (nx >= 0 && ny >= 0 && nx < W && ny < H) drop[ny * W + nx] = 1
      }
    }
  }

  const pad = 4
  const x0 = Math.max(0, best.x0 - pad)
  const y0 = Math.max(0, best.y0 - pad)
  const x1 = Math.min(W - 1, best.x1 + pad)
  const y1 = Math.min(H - 1, best.y1 + pad)
  const w = x1 - x0 + 1
  const h = y1 - y0 + 1

  // Negro a transparencia.
  const out = Buffer.alloc(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = ((y0 + y) * W + (x0 + x)) * C
      const o = (y * w + x) * 4
      if (drop[(y0 + y) * W + (x0 + x)]) continue
      const m = Math.max(data[i], data[i + 1], data[i + 2])
      const a = Math.min(1, Math.max(0, (m - BASE) / (255 - BASE)))
      out[o + 3] = Math.round(a * 255)
      if (a === 0) continue
      for (let c = 0; c < 3; c++) {
        out[o + c] = Math.min(255, Math.max(0, Math.round((data[i + c] - (1 - a) * BASE) / a)))
      }
    }
  }
  await sharp(out, { raw: { width: w, height: h, channels: 4 } }).png({ compressionLevel: 9 }).toFile(LOGO)
  console.log(`logo.png ${w}x${h}`)
}

/** Cuadrado de lado `size` con el logo centrado, a `ratio` del alto. */
async function tile(size, ratio, { radius = 0 } = {}) {
  const logoH = Math.round(size * ratio)
  const logo = await sharp(LOGO).resize({ height: logoH, kernel: 'lanczos3' }).toBuffer()
  const base = radius
    ? sharp({ create: { width: size, height: size, channels: 4, background: '#00000000' } }).composite([
        {
          input: Buffer.from(
            `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${Math.round(size * radius)}" fill="${BG}"/></svg>`,
          ),
        },
      ])
    : sharp({ create: { width: size, height: size, channels: 4, background: BG } })
  // `composite` con un buffer ya compuesto: se aplana primero la base.
  const flat = await base.png().toBuffer()
  return sharp(flat).composite([{ input: logo, gravity: 'center' }]).png({ compressionLevel: 9 }).toBuffer()
}

/** ICO con imágenes PNG dentro (lo aceptan todos los navegadores actuales). */
function ico(images) {
  const head = Buffer.alloc(6)
  head.writeUInt16LE(1, 2)
  head.writeUInt16LE(images.length, 4)
  let offset = 6 + images.length * 16
  const entries = images.map(({ size, png }) => {
    const e = Buffer.alloc(16)
    e[0] = size >= 256 ? 0 : size
    e[1] = size >= 256 ? 0 : size
    e.writeUInt16LE(1, 4)
    e.writeUInt16LE(32, 6)
    e.writeUInt32LE(png.length, 8)
    e.writeUInt32LE(offset, 12)
    offset += png.length
    return e
  })
  return Buffer.concat([head, ...entries, ...images.map((i) => i.png)])
}

async function main() {
  const original = process.argv[2]
  if (original) await buildLogo(original)
  if (!fs.existsSync(LOGO)) throw new Error('Falta public/logo.png: pasa la imagen original como argumento.')

  const write = (name, buf) => {
    fs.writeFileSync(path.join(PUBLIC, name), buf)
    console.log(name, buf.length + ' B')
  }

  // Ícono normal: esquinas redondeadas y aire alrededor.
  write('icon-192.png', await tile(192, 0.76, { radius: 0.2 }))
  write('icon-512.png', await tile(512, 0.76, { radius: 0.2 }))
  // Adaptable de Android: cuadrado entero, que el sistema recorta con su forma.
  // El logo se queda dentro del círculo seguro (80 % del lado).
  write('icon-maskable-512.png', await tile(512, 0.6))
  // iOS pone su propia máscara: a pantalla completa y sin transparencia.
  write('apple-touch-icon.png', await tile(180, 0.7))
  // Pestaña del navegador: pocos píxeles, así que el logo ocupa casi todo.
  const fav = {}
  for (const s of [16, 32, 48]) fav[s] = await tile(s, 0.88, { radius: 0.18 })
  write('favicon-16.png', fav[16])
  write('favicon-32.png', fav[32])
  write('favicon.ico', ico([16, 32, 48].map((size) => ({ size, png: fav[size] }))))
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
