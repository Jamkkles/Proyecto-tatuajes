/**
 * Reúne en un solo archivo las métricas de calidad del proyecto.
 *
 *   node backend/calidad/medir.js
 *
 * Corre en el host y va llamando a cada herramienta dentro del contenedor que
 * corresponde, porque en el host jest y eslint se cuelgan al leer node_modules
 * desde la carpeta sincronizada (ver CLAUDE.md). Deja todo en
 * docs/calidad/metricas.json, que es lo que lee el informe.
 *
 * Lo que mide y con qué:
 *   - Pruebas y cobertura ....... Jest + Istanbul
 *   - Análisis estático ......... ESLint (backend y frontend) y TypeScript
 *   - Dependencias .............. npm audit
 *   - Tamaño y documentación .... recuento propio sobre el código fuente
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..', '..');
const SALIDA = path.join(RAIZ, 'docs', 'calidad', 'metricas.json');
const BACK = 'proyecto-tatuajes-backend-1';
const FRONT = 'proyecto-tatuajes-frontend-1';

const paso = (texto) => process.stdout.write(`• ${texto}\n`);

/** Ejecuta dentro de un contenedor. Devuelve { ok, salida }. */
function enContenedor(contenedor, comando) {
  try {
    const salida = execFileSync('docker', ['exec', contenedor, 'sh', '-lc', comando], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true, salida };
  } catch (err) {
    // Varias herramientas devuelven un código distinto de cero cuando
    // encuentran algo; su salida sigue siendo lo que interesa.
    return { ok: false, salida: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

const comoJson = (texto, porDefecto = null) => {
  const i = texto.indexOf('{');
  const j = texto.lastIndexOf('}');
  if (i === -1 || j === -1) return porDefecto;
  try {
    return JSON.parse(texto.slice(i, j + 1));
  } catch {
    return porDefecto;
  }
};

// ----------------------------------------------------------- código fuente

const EXT = /\.(js|ts|tsx|sql)$/;

function recorrer(dir, acc = []) {
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entrada.name === 'node_modules' || entrada.name === 'coverage') continue;
    const completo = path.join(dir, entrada.name);
    if (entrada.isDirectory()) recorrer(completo, acc);
    else if (EXT.test(entrada.name)) acc.push(completo);
  }
  return acc;
}

/** Cuenta líneas de código, de comentario y en blanco. Es una aproximación. */
function contar(archivos) {
  let codigo = 0;
  let comentario = 0;
  let blanco = 0;
  let enBloque = false;
  for (const archivo of archivos) {
    for (const cruda of fs.readFileSync(archivo, 'utf8').split('\n')) {
      const linea = cruda.trim();
      if (!linea) {
        blanco++;
        continue;
      }
      if (enBloque) {
        comentario++;
        if (linea.includes('*/')) enBloque = false;
        continue;
      }
      if (linea.startsWith('/*')) {
        comentario++;
        if (!linea.includes('*/')) enBloque = true;
        continue;
      }
      if (linea.startsWith('//') || linea.startsWith('*') || linea.startsWith('--')) {
        comentario++;
        continue;
      }
      codigo++;
    }
  }
  return { archivos: archivos.length, codigo, comentario, blanco };
}

function medirCodigo() {
  const partes = {
    'Backend · rutas y controladores': ['backend/src/routes', 'backend/src/controllers'],
    'Backend · modelos y base de datos': ['backend/src/models', 'backend/src/db'],
    'Backend · servicios': ['backend/src/services'],
    'Backend · middleware, utilidades y configuración': [
      'backend/src/middleware',
      'backend/src/utils',
      'backend/src/config',
      'backend/src/data',
    ],
    'Frontend · páginas y componentes': ['frontend/src/pages', 'frontend/src/components'],
    'Frontend · lógica compartida': ['frontend/src/lib'],
    'Pruebas automatizadas': ['backend/tests'],
  };

  const porParte = {};
  for (const [nombre, dirs] of Object.entries(partes)) {
    const archivos = dirs
      .map((d) => path.join(RAIZ, d))
      .filter((d) => fs.existsSync(d))
      .flatMap((d) => recorrer(d));
    porParte[nombre] = contar(archivos);
  }
  return porParte;
}

// ------------------------------------------------------------------ main

(async () => {
  process.stdout.write('Midiendo la calidad del proyecto\n\n');

  paso('Pruebas y cobertura (Jest + Istanbul)');
  const jest = enContenedor(
    BACK,
    'npx jest --runInBand --coverage --coverageReporters=json-summary --json 2>/dev/null'
  );
  const resultado = comoJson(jest.salida, {});
  const resumenCobertura = JSON.parse(
    fs.readFileSync(path.join(RAIZ, 'backend', 'coverage', 'coverage-summary.json'), 'utf8')
  );
  const porProyecto = { unitarias: 0, integracion: 0 };
  for (const t of resultado.testResults ?? []) {
    const ruta = t.name.split('\\').join('/');
    const clave = ruta.includes('/integracion/') ? 'integracion' : 'unitarias';
    porProyecto[clave] += t.assertionResults.length;
  }

  // La cobertura agrupada por capa, que es como se lee en la memoria.
  const NOMBRES = {
    routes: 'Rutas',
    controllers: 'Controladores',
    models: 'Modelos (SQL)',
    services: 'Servicios',
    'services/storage': 'Almacenamiento',
    'services/whatsappWeb': 'WhatsApp vinculado',
    middleware: 'Middleware',
    utils: 'Utilidades',
    config: 'Configuración',
    data: 'Datos de catálogo',
  };
  const capas = {};
  for (const [archivo, v] of Object.entries(resumenCobertura)) {
    if (archivo === 'total') continue;
    const rel = archivo.split('\\').join('/').split('/src/')[1];
    if (!rel || !rel.includes('/')) continue;
    const dir = rel.slice(0, rel.lastIndexOf('/'));
    const nombre = NOMBRES[dir] ?? dir;
    capas[nombre] = capas[nombre] ?? { total: 0, cubierto: 0 };
    capas[nombre].total += v.statements.total;
    capas[nombre].cubierto += v.statements.covered;
  }
  const coberturaPorCapa = Object.entries(capas)
    .map(([nombre, v]) => ({ nombre, pct: Number(((100 * v.cubierto) / v.total).toFixed(1)), ...v }))
    .sort((a, b) => b.pct - a.pct);

  paso('Análisis estático del backend (ESLint)');
  const eslintBack = enContenedor(BACK, 'npx eslint . -f json 2>/dev/null');
  paso('Análisis estático del frontend (ESLint)');
  const eslintFront = enContenedor(FRONT, 'npx eslint . -f json 2>/dev/null');
  const problemas = (salida) => {
    let lista;
    try {
      lista = JSON.parse(salida.slice(salida.indexOf('[')));
    } catch {
      return null;
    }
    return {
      archivos: lista.length,
      errores: lista.reduce((n, f) => n + f.errorCount, 0),
      advertencias: lista.reduce((n, f) => n + f.warningCount, 0),
    };
  };

  paso('Comprobación de tipos del frontend (TypeScript)');
  const tsc = enContenedor(FRONT, 'npx tsc --noEmit -p tsconfig.app.json');

  paso('Dependencias (npm audit)');
  const audit = (contenedor, soloProduccion) => {
    const r = enContenedor(
      contenedor,
      `npm audit --json ${soloProduccion ? '--omit=dev' : ''} 2>/dev/null`
    );
    return comoJson(r.salida, {}).metadata?.vulnerabilities ?? null;
  };

  paso('Tamaño y documentación del código');
  const codigo = medirCodigo();

  const pkgBack = JSON.parse(fs.readFileSync(path.join(RAIZ, 'backend', 'package.json'), 'utf8'));
  const pkgFront = JSON.parse(fs.readFileSync(path.join(RAIZ, 'frontend', 'package.json'), 'utf8'));
  const version = (pkg, nombre) =>
    (pkg.dependencies?.[nombre] ?? pkg.devDependencies?.[nombre] ?? '').replace(/^[\^~]/, '');

  const metricas = {
    fecha: new Date().toISOString(),
    pruebas: {
      archivos: resultado.numTotalTestSuites ?? null,
      total: resultado.numTotalTests ?? null,
      aprobadas: resultado.numPassedTests ?? null,
      fallidas: resultado.numFailedTests ?? null,
      unitarias: porProyecto.unitarias,
      integracion: porProyecto.integracion,
    },
    cobertura: resumenCobertura.total,
    coberturaPorCapa,
    deuda: {
      // Marcas de trabajo pendiente dejadas en el código.
      marcas: recorrer(path.join(RAIZ, 'backend', 'src'))
        .concat(recorrer(path.join(RAIZ, 'frontend', 'src')))
        .reduce(
          (n, f) => n + (fs.readFileSync(f, 'utf8').match(/TODO|FIXME|XXX|HACK/g) ?? []).length,
          0
        ),
    },
    estatico: {
      eslintBackend: problemas(eslintBack.salida),
      eslintFrontend: problemas(eslintFront.salida),
      tipos: { ok: tsc.ok, salida: tsc.salida.trim().slice(0, 400) },
    },
    dependencias: {
      backend: { produccion: audit(BACK, true), todas: audit(BACK, false) },
      frontend: { produccion: audit(FRONT, true), todas: audit(FRONT, false) },
    },
    codigo,
    herramientas: {
      node: process.version,
      jest: version(pkgBack, 'jest'),
      supertest: version(pkgBack, 'supertest'),
      eslint: version(pkgBack, 'eslint'),
      typescript: version(pkgFront, 'typescript'),
      vite: version(pkgFront, 'vite'),
    },
  };

  fs.mkdirSync(path.dirname(SALIDA), { recursive: true });
  fs.writeFileSync(SALIDA, JSON.stringify(metricas, null, 2));
  process.stdout.write(`\nMétricas en ${SALIDA}\n`);
  process.stdout.write(
    `  ${metricas.pruebas.total} pruebas, ${metricas.cobertura.statements.pct} % de sentencias, ` +
      `${metricas.estatico.eslintBackend?.errores ?? '?'} errores de ESLint en el backend\n`
  );
})();
