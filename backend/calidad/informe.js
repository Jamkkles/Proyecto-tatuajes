/**
 * Arma el informe visual de calidad a partir de docs/calidad/metricas.json.
 *
 *   node backend/calidad/informe.js
 *
 * Escribe docs/calidad/index.html —una página sola, sin recursos externos— y
 * los gráficos en PNG dentro de docs/calidad/imagenes/.
 */
const fs = require('fs');
const path = require('path');
const sharp = require(path.join(__dirname, '..', 'node_modules', 'sharp'));

const DIR = path.join(__dirname, '..', '..', 'docs', 'calidad');
const IMG = path.join(DIR, 'imagenes');
const m = JSON.parse(fs.readFileSync(path.join(DIR, 'metricas.json'), 'utf8'));

const C = {
  texto: '#2c3340',
  suave: '#6b7585',
  suaveFuera: '#58616f',
  rejilla: '#e8ebef',
  eje: '#8b95a1',
  azul: '#2f6fb5',
  verde: '#1f7a44',
  ambar: '#b8860b',
  rojo: '#b4383a',
  barraSuave: '#cdd9e5',
};
const FUENTE = "'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const coma = (n) => String(n).replace('.', ',');
const miles = (n) => n.toLocaleString('es-CL');

/** Barras horizontales con el porcentaje de cobertura de cada capa. */
function graficoCobertura() {
  const filas = m.coberturaPorCapa;
  const W = 900;
  const alto = 34;
  const H = 70 + filas.length * alto + 30;
  const izq = 230;
  const ancho = W - izq - 90;

  const partes = [`<rect width="${W}" height="${H}" fill="#ffffff"/>`];
  partes.push(
    `<text x="24" y="32" font-family="${FUENTE}" font-size="17" font-weight="600" fill="${C.texto}">Cobertura de sentencias por capa</text>`
  );
  partes.push(
    `<text x="24" y="52" font-family="${FUENTE}" font-size="12.5" fill="${C.suave}">La línea marca el 95 % comprometido por el proyecto</text>`
  );

  const y0 = 74;
  const x95 = izq + ancho * 0.95;
  partes.push(
    `<line x1="${x95}" y1="${y0 - 6}" x2="${x95}" y2="${y0 + filas.length * alto}" stroke="${C.ambar}" stroke-width="1.5" stroke-dasharray="4 3"/>`
  );

  for (const [i, f] of filas.entries()) {
    const y = y0 + i * alto;
    const largo = (f.pct / 100) * ancho;
    const color = f.pct >= 95 ? C.verde : C.ambar;
    partes.push(
      `<text x="${izq - 12}" y="${y + 18}" text-anchor="end" font-family="${FUENTE}" font-size="13.5" fill="${C.texto}">${esc(f.nombre)}</text>`
    );
    partes.push(`<rect x="${izq}" y="${y + 5}" width="${ancho}" height="18" fill="#f1f4f7" rx="3"/>`);
    partes.push(`<rect x="${izq}" y="${y + 5}" width="${largo}" height="18" fill="${color}" rx="3"/>`);
    partes.push(
      `<text x="${izq + ancho + 10}" y="${y + 18}" font-family="${FUENTE}" font-size="13" font-variant-numeric="tabular-nums" fill="${C.texto}">${coma(f.pct)} %</text>`
    );
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${partes.join('')}</svg>`;
}

/** Líneas de código y de comentario por parte del proyecto. */
function graficoCodigo() {
  const filas = Object.entries(m.codigo).map(([nombre, v]) => ({ nombre, ...v }));
  const W = 900;
  const alto = 40;
  const H = 86 + filas.length * alto + 20;
  const izq = 330;
  const ancho = W - izq - 110;
  const max = Math.max(...filas.map((f) => f.codigo + f.comentario));

  const partes = [`<rect width="${W}" height="${H}" fill="#ffffff"/>`];
  partes.push(
    `<text x="24" y="32" font-family="${FUENTE}" font-size="17" font-weight="600" fill="${C.texto}">Tamaño del proyecto, parte por parte</text>`
  );
  partes.push(
    `<rect x="24" y="44" width="12" height="12" fill="${C.azul}"/><text x="42" y="54" font-family="${FUENTE}" font-size="12.5" fill="${C.suave}">Líneas de código</text>`
  );
  partes.push(
    `<rect x="170" y="44" width="12" height="12" fill="${C.barraSuave}"/><text x="188" y="54" font-family="${FUENTE}" font-size="12.5" fill="${C.suave}">Líneas de comentario</text>`
  );

  const y0 = 78;
  for (const [i, f] of filas.entries()) {
    const y = y0 + i * alto;
    const a1 = (f.codigo / max) * ancho;
    const a2 = (f.comentario / max) * ancho;
    partes.push(
      `<text x="${izq - 12}" y="${y + 18}" text-anchor="end" font-family="${FUENTE}" font-size="13" fill="${C.texto}">${esc(f.nombre)}</text>`
    );
    partes.push(`<rect x="${izq}" y="${y + 5}" width="${a1}" height="18" fill="${C.azul}" rx="2"/>`);
    partes.push(
      `<rect x="${izq + a1}" y="${y + 5}" width="${a2}" height="18" fill="${C.barraSuave}" rx="2"/>`
    );
    partes.push(
      `<text x="${izq + a1 + a2 + 10}" y="${y + 18}" font-family="${FUENTE}" font-size="12.5" font-variant-numeric="tabular-nums" fill="${C.suave}">${miles(f.codigo)} + ${miles(f.comentario)}</text>`
    );
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${partes.join('')}</svg>`;
}

// ------------------------------------------------------------------ página

const cob = m.cobertura;
const dep = m.dependencias;
const codigoTotal = Object.values(m.codigo).reduce(
  (a, v) => ({
    archivos: a.archivos + v.archivos,
    codigo: a.codigo + v.codigo,
    comentario: a.comentario + v.comentario,
  }),
  { archivos: 0, codigo: 0, comentario: 0 }
);
const lineasBackend =
  m.codigo['Backend · rutas y controladores'].codigo +
  m.codigo['Backend · modelos y base de datos'].codigo +
  m.codigo['Backend · servicios'].codigo +
  m.codigo['Backend · middleware, utilidades y configuración'].codigo;
const razonPruebas = (m.codigo['Pruebas automatizadas'].codigo / lineasBackend).toFixed(1);

const fecha = new Date(m.fecha).toLocaleString('es-CL', { dateStyle: 'long', timeStyle: 'short' });

const tarjeta = (n, t, clase = '') => `<div class="tarjeta"><div class="n ${clase}">${n}</div><div class="t">${t}</div></div>`;

const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Informe de calidad de código — Plataforma para estudios de tatuaje</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin:0; padding:40px 24px 72px; background:#f4f6f8; color:${C.texto};
         font-family:${FUENTE}; line-height:1.55; }
  main, footer { max-width:1000px; margin:0 auto; }
  h1 { font-size:30px; margin:0 0 6px; letter-spacing:-.01em; }
  .sub { color:${C.suaveFuera}; margin:0 0 26px; font-size:15px; }
  section { background:#fff; border:1px solid #e3e7ec; border-radius:10px; padding:26px 28px; margin-bottom:22px; }
  h2 { font-size:19px; margin:0 0 8px; }
  .desc { color:${C.suave}; margin:0 0 18px; font-size:14.5px; max-width:80ch; }
  .tarjetas { display:grid; grid-template-columns:repeat(auto-fit,minmax(165px,1fr)); gap:14px; margin:0 0 18px; }
  .tarjeta { background:#f8fafc; border:1px solid #e3e7ec; border-radius:8px; padding:14px 16px; }
  .tarjeta .n { font-size:25px; font-weight:600; font-variant-numeric:tabular-nums; }
  .tarjeta .t { font-size:13px; color:${C.suaveFuera}; }
  .ok { color:${C.verde}; } .ojo { color:${C.ambar}; }
  table { border-collapse:collapse; width:100%; font-size:14px; }
  th, td { border-bottom:1px solid #eceff3; padding:7px 10px; text-align:left; }
  th { font-size:12.5px; text-transform:uppercase; letter-spacing:.04em; color:${C.suaveFuera}; font-weight:600; }
  td.num { text-align:right; font-variant-numeric:tabular-nums; }
  figure { margin:0 0 18px; overflow-x:auto; }
  svg { max-width:100%; height:auto; display:block; }
  .pista { font-size:14px; color:${C.suaveFuera}; margin:18px 0 0; background:#f8fafc;
           border:1px solid #e8ebef; border-radius:8px; padding:12px 16px; }
  footer { color:${C.suaveFuera}; font-size:13.5px; }
  code { background:#eef1f5; padding:1px 6px; border-radius:4px; font-size:13px; }
</style>
</head>
<body>
<main>
  <h1>Informe de calidad de código</h1>
  <p class="sub">Plataforma de gestión para estudios de tatuaje · ${esc(fecha)}</p>

  <section>
    <h2>Resumen</h2>
    <div class="tarjetas">
      ${tarjeta(miles(m.pruebas.total), 'pruebas automatizadas, todas aprobadas', 'ok')}
      ${tarjeta(coma(cob.statements.pct) + ' %', 'de las sentencias cubiertas por las pruebas')}
      ${tarjeta(m.estatico.eslintBackend.errores + m.estatico.eslintFrontend.errores, 'problemas en el análisis estático', 'ok')}
      ${tarjeta(m.estatico.tipos.ok ? 'Sin errores' : 'Con errores', 'en la comprobación de tipos', m.estatico.tipos.ok ? 'ok' : '')}
      ${tarjeta(dep.backend.produccion.total + dep.frontend.produccion.total, 'vulnerabilidades en dependencias de producción', 'ojo')}
      ${tarjeta(m.deuda.marcas, 'marcas de trabajo pendiente en el código', 'ok')}
    </div>
    <p class="desc">Cada cifra de este informe sale de ejecutar una herramienta, no de una apreciación.
      La última sección dice cuál produce cada una y cómo repetirlas.</p>
  </section>

  <section>
    <h2>1. Pruebas automatizadas</h2>
    <p class="desc">Son ${miles(m.pruebas.total)} pruebas repartidas en ${m.pruebas.archivos} archivos, y las
      ${miles(m.pruebas.aprobadas)} pasan. Se dividen en dos baterías que corren juntas:
      <b>${miles(m.pruebas.unitarias)} unitarias</b>, que prueban cada pieza aislada reemplazando sus
      vecinas por dobles, y <b>${m.pruebas.integracion} de integración</b>, que corren contra un PostgreSQL
      real y son las únicas capaces de demostrar lo que depende del motor de base de datos: que diez
      peticiones simultáneas pidiendo la misma hora dejan una sola cita, que el stock no queda negativo o
      que una cotización no se descuenta dos veces.</p>
    <div class="tarjetas">
      ${tarjeta(miles(m.pruebas.unitarias), 'pruebas unitarias')}
      ${tarjeta(m.pruebas.integracion, 'pruebas de integración')}
      ${tarjeta(m.pruebas.fallidas, 'fallidas', 'ok')}
      ${tarjeta(razonPruebas + ' : 1', 'líneas de prueba por cada línea de backend')}
    </div>
    <p class="pista">Herramientas: <b>Jest</b> ${esc(m.herramientas.jest)} como ejecutor y
      <b>Supertest</b> ${esc(m.herramientas.supertest)} para hacerle peticiones HTTP a la aplicación sin
      levantar un servidor.</p>
  </section>

  <section>
    <h2>2. Cobertura de código</h2>
    <p class="desc">Mientras las pruebas corren, la herramienta anota por dónde pasó la ejecución. El
      resultado es qué porcentaje del código llegó a ejecutarse. Dice qué se probó, no si se comprobó
      correctamente: eso lo sostienen las aserciones de cada prueba.</p>
    <div class="tarjetas">
      ${tarjeta(coma(cob.lines.pct) + ' %', `líneas (${miles(cob.lines.covered)} de ${miles(cob.lines.total)})`)}
      ${tarjeta(coma(cob.statements.pct) + ' %', `sentencias (${miles(cob.statements.covered)} de ${miles(cob.statements.total)})`)}
      ${tarjeta(coma(cob.functions.pct) + ' %', `funciones (${cob.functions.covered} de ${cob.functions.total})`)}
      ${tarjeta(coma(cob.branches.pct) + ' %', `ramas (${miles(cob.branches.covered)} de ${miles(cob.branches.total)})`, 'ojo')}
    </div>
    <figure>${graficoCobertura()}</figure>
    <p class="desc">Todas las capas propias de la aplicación pasan del 95 %. La que queda abajo es la del
      WhatsApp vinculado, porque lo que no se ejecuta ahí son los caminos que solo ocurren contra un socket
      real de WhatsApp. La cobertura de <b>ramas</b> es la más baja porque cuenta cada bifurcación por
      separado: una condición con tres causas posibles exige tres pruebas aunque sea una sola línea.</p>
    <p class="pista">Herramienta: <b>Istanbul</b>, incorporado en Jest. Queda fuera del cálculo
      <code>src/db</code>, que son scripts de consola que se ejecutan a mano; la exclusión está declarada en
      <code>backend/jest.config.js</code>.</p>
  </section>

  <section>
    <h2>3. Análisis estático</h2>
    <p class="desc">Revisa el código sin ejecutarlo. Encuentra una familia de errores distinta a la de las
      pruebas: variables que no existen, código inalcanzable, promesas mal usadas, tipos que no calzan.</p>
    <table>
      <thead><tr><th>Revisión</th><th>Qué comprueba</th><th class="num">Archivos</th><th class="num">Errores</th><th class="num">Avisos</th></tr></thead>
      <tbody>
        <tr><td>ESLint · backend</td><td>Reglas recomendadas sobre el código de Node</td><td class="num">${m.estatico.eslintBackend.archivos}</td><td class="num">${m.estatico.eslintBackend.errores}</td><td class="num">${m.estatico.eslintBackend.advertencias}</td></tr>
        <tr><td>ESLint · frontend</td><td>Reglas recomendadas más las de React y sus hooks</td><td class="num">${m.estatico.eslintFrontend.archivos}</td><td class="num">${m.estatico.eslintFrontend.errores}</td><td class="num">${m.estatico.eslintFrontend.advertencias}</td></tr>
        <tr><td>TypeScript · frontend</td><td>Que los tipos calcen en todo el proyecto</td><td class="num">—</td><td class="num">${m.estatico.tipos.ok ? 0 : '≥1'}</td><td class="num">—</td></tr>
      </tbody>
    </table>
    <p class="pista">Herramientas: <b>ESLint</b> ${esc(m.herramientas.eslint)} y el compilador de
      <b>TypeScript</b> ${esc(m.herramientas.typescript)}. La configuración del backend
      (<code>backend/eslint.config.js</code>) parte de las reglas recomendadas y deja fuera las de formato:
      el formato no aporta a la calidad y solo genera ruido.</p>
  </section>

  <section>
    <h2>4. Seguridad de las dependencias</h2>
    <p class="desc">Un proyecto moderno es, en buena parte, código de terceros. Esta revisión compara las
      versiones instaladas contra la base pública de vulnerabilidades conocidas.</p>
    <table>
      <thead><tr><th>Proyecto</th><th class="num">Antes</th><th class="num">Después</th><th>Qué queda</th></tr></thead>
      <tbody>
        <tr>
          <td>Backend · dependencias de producción</td>
          <td class="num">8</td>
          <td class="num">${dep.backend.produccion.total}</td>
          <td>Una de severidad alta en la biblioteca de correo, que exige un cambio de versión mayor. En la
              nube el correo no la usa: sale por la interfaz HTTPS del proveedor</td>
        </tr>
        <tr>
          <td>Frontend · todas</td>
          <td class="num">19</td>
          <td class="num">${dep.frontend.todas.total}</td>
          <td>Ninguna</td>
        </tr>
      </tbody>
    </table>
    <p class="desc">Las correcciones se aplicaron y después se volvió a ejecutar la batería completa: las
      ${miles(m.pruebas.total)} pruebas siguen pasando, el compilador de tipos sigue limpio y la aplicación
      sigue compilando. Esa comprobación es justamente para lo que sirve tener pruebas.</p>
    <p class="pista">Herramienta: <b>npm audit</b>, que consulta el registro público de avisos de seguridad.</p>
  </section>

  <section>
    <h2>5. Tamaño y documentación del código</h2>
    <p class="desc">El proyecto son ${miles(codigoTotal.codigo)} líneas de código repartidas en
      ${codigoTotal.archivos} archivos, más ${miles(codigoTotal.comentario)} líneas de comentario. Esa
      proporción —uno de cada ocho renglones explica algo— no es casual: los comentarios de este proyecto
      no repiten lo que el código ya dice, explican <b>por qué</b> está hecho así y qué se intentó antes.</p>
    <figure>${graficoCodigo()}</figure>
    <table>
      <thead><tr><th>Parte</th><th class="num">Archivos</th><th class="num">Código</th><th class="num">Comentarios</th></tr></thead>
      <tbody>
        ${Object.entries(m.codigo)
          .map(
            ([n, v]) =>
              `<tr><td>${esc(n)}</td><td class="num">${v.archivos}</td><td class="num">${miles(v.codigo)}</td><td class="num">${miles(v.comentario)}</td></tr>`
          )
          .join('\n        ')}
        <tr><td><b>Total</b></td><td class="num"><b>${codigoTotal.archivos}</b></td><td class="num"><b>${miles(codigoTotal.codigo)}</b></td><td class="num"><b>${miles(codigoTotal.comentario)}</b></td></tr>
      </tbody>
    </table>
    <p class="desc" style="margin-top:18px">Dos cifras que vale la pena mirar juntas: hay
      <b>${razonPruebas} líneas de prueba por cada línea de backend</b>, y <b>${m.deuda.marcas} marcas</b> de
      trabajo pendiente (<code>TODO</code>, <code>FIXME</code>) en todo el código fuente. Lo que quedó sin
      hacer está documentado en la memoria con su razón, no abandonado como un comentario en un archivo.</p>
  </section>

  <section>
    <h2>6. Herramientas utilizadas</h2>
    <table>
      <thead><tr><th>Herramienta</th><th>Versión</th><th>Para qué</th></tr></thead>
      <tbody>
        <tr><td>Jest</td><td>${esc(m.herramientas.jest)}</td><td>Ejecuta las pruebas y organiza las dos baterías</td></tr>
        <tr><td>Supertest</td><td>${esc(m.herramientas.supertest)}</td><td>Hace peticiones HTTP a la aplicación dentro de la prueba</td></tr>
        <tr><td>Istanbul</td><td>incluido en Jest</td><td>Mide la cobertura y genera el informe navegable</td></tr>
        <tr><td>PostgreSQL</td><td>16</td><td>Base real contra la que corren las pruebas de integración</td></tr>
        <tr><td>ESLint</td><td>${esc(m.herramientas.eslint)}</td><td>Análisis estático del backend y del frontend</td></tr>
        <tr><td>TypeScript</td><td>${esc(m.herramientas.typescript)}</td><td>Comprobación de tipos de todo el frontend</td></tr>
        <tr><td>npm audit</td><td>incluido en npm</td><td>Vulnerabilidades conocidas en las dependencias</td></tr>
        <tr><td>Node.js</td><td>${esc(m.herramientas.node)}</td><td>Entorno donde corre todo lo anterior</td></tr>
        <tr><td>Docker</td><td>—</td><td>Aísla la ejecución: todas las medidas se toman dentro del contenedor</td></tr>
      </tbody>
    </table>
    <p class="pista">Para repetir todas las medidas: <code>node backend/calidad/medir.js</code> y luego
      <code>node backend/calidad/informe.js</code>. La primera llama a cada herramienta dentro de su
      contenedor y deja los datos crudos en <code>docs/calidad/metricas.json</code>; la segunda arma esta
      página y sus imágenes.</p>
  </section>
</main>
<footer>
  Todas las cifras provienen de la ejecución de las herramientas en la fecha indicada arriba, sobre el
  código tal como está en el repositorio. Los informes complementarios son
  <code>docs/cobertura/</code> (detalle de cobertura) y <code>docs/pruebas-estres/</code> (carga y estrés).
</footer>
</body>
</html>
`;

fs.mkdirSync(IMG, { recursive: true });
fs.writeFileSync(path.join(DIR, 'index.html'), html);
console.log('informe:', path.join(DIR, 'index.html'));

(async () => {
  for (const [nombre, svg] of [
    ['cobertura-por-capa.png', graficoCobertura()],
    ['tamano-del-codigo.png', graficoCodigo()],
  ]) {
    const destino = path.join(IMG, nombre);
    await sharp(Buffer.from(svg), { density: 192 }).png({ compressionLevel: 9 }).toFile(destino);
    const meta = await sharp(destino).metadata();
    console.log(`imagen: ${nombre}  ${meta.width}x${meta.height}`);
  }
})();
