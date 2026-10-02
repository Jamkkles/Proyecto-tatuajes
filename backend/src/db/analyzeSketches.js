// Vuelve a medir la tinta y los colores de los bocetos ya subidos.
// Uso: npm run sketches:analyze
//
// `ink_ratio` y `palette` se miden al subir la imagen, así que los bocetos
// anteriores a esa iteración los tienen en NULL. Sin ellos la cotización no
// sabe cuánto del lienzo lleva tinta ni de qué colores es, y tiene que caer en
// sus valores por defecto. Este script los rellena leyendo los archivos que ya
// están guardados; es de una sola pasada y se puede repetir sin riesgo.
require('dotenv').config();
const pool = require('../config/db');
const storage = require('../services/storage');
const { readInkProfile } = require('../services/imageOptimizer');

async function main() {
  const soloFaltantes = !process.argv.includes('--all');
  const { rows } = await pool.query(
    `SELECT id, title, storage_driver, storage_key, ink_ratio
       FROM sketches
      ${soloFaltantes ? 'WHERE ink_ratio IS NULL OR palette IS NULL' : ''}
      ORDER BY created_at`
  );

  if (rows.length === 0) {
    console.log('✓ No hay bocetos por analizar.');
    return;
  }
  console.log(`Analizando ${rows.length} boceto(s)…\n`);

  let medidos = 0;
  let sinArchivo = 0;

  for (const sketch of rows) {
    const nombre = sketch.title.slice(0, 38).padEnd(40);
    let buffer;
    try {
      // Con el driver con que se subió, no el activo: así los bocetos de antes
      // de migrar a la nube se siguen leyendo del disco.
      buffer = await storage.getDriver(sketch.storage_driver).read(sketch.storage_key);
    } catch (err) {
      console.log(`  ✗ ${nombre} no se pudo leer: ${err.message}`);
      sinArchivo++;
      continue;
    }
    if (!buffer) {
      console.log(`  ✗ ${nombre} el archivo ya no está`);
      sinArchivo++;
      continue;
    }

    const { inkRatio, palette } = await readInkProfile(buffer);
    if (inkRatio === null) {
      console.log(`  · ${nombre} sin tinta reconocible, se deja como estaba`);
      continue;
    }

    await pool.query('UPDATE sketches SET ink_ratio = $2, palette = $3 WHERE id = $1', [
      sketch.id,
      inkRatio,
      palette ? JSON.stringify(palette) : null,
    ]);
    const colores = palette ? palette.map((c) => `${c.hex} ${Math.round(c.share * 100)}%`).join('  ') : '—';
    console.log(`  ✓ ${nombre} cobertura ${(inkRatio * 100).toFixed(1).padStart(5)}%   ${colores}`);
    medidos++;
  }

  console.log(`\n${medidos} boceto(s) analizado(s)${sinArchivo ? `, ${sinArchivo} sin archivo` : ''}.`);
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error('✗ Error analizando los bocetos:', err.message);
    pool.end();
    process.exit(1);
  });
