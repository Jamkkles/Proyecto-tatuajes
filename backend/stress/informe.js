/**
 * Arma el informe visual de las pruebas de carga a partir de resultados.json.
 *
 *   node backend/stress/informe.js
 *
 * Escribe docs/pruebas-estres/index.html —una sola página, sin recursos
 * externos, se abre con doble clic— y una imagen PNG por gráfico en
 * docs/pruebas-estres/imagenes/, para usarlas en una presentación.
 */
const fs = require('fs');
const path = require('path');
const sharp = require(path.join(__dirname, '..', 'node_modules', 'sharp'));

const DIR = path.join(__dirname, '..', '..', 'docs', 'pruebas-estres');
const IMG = path.join(DIR, 'imagenes');
const datos = JSON.parse(fs.readFileSync(path.join(DIR, 'resultados.json'), 'utf8'));

/**
 * Proyección —no medición— de lo que daría el mismo sistema en el plan gratuito
 * de Render (512 MB, fracción de CPU, región Ohio) con la base en Neon.
 *
 * Los rangos salen de tres factores que se explican en la sección del informe:
 * la CPU compartida vale entre diez y quince veces menos que un núcleo de la
 * máquina de prueba; la base deja de estar en memoria y pasa a cruzar la red; y
 * la subida de imágenes topa con los 512 MB antes que con la CPU. Si algún día
 * se mide de verdad contra el despliegue, estas cifras se reemplazan.
 */
const NUBE = {
  agenda: { rango: [15, 40], limite: 'CPU compartida del plan gratuito' },
  cotizacion: { rango: [10, 30], limite: 'CPU: el cálculo es casi todo cómputo' },
  agendado: { rango: [5, 15], limite: 'Cada escritura cruza la red hasta Neon, con el bloqueo tomado' },
  subida: { rango: [0.5, 2], limite: 'Memoria: 512 MB con la imagen descomprimida' },
};

const COLOR = {
  barra: '#cdd9e5',
  barraBorde: '#9fb3c8',
  p50: '#2f6fb5',
  p95: '#e08a2b',
  p99: '#b4383a',
  rejilla: '#e8ebef',
  eje: '#8b95a1',
  texto: '#2c3340',
  suave: '#6b7585',
  // Sobre el fondo gris de la página, el gris de las tarjetas no alcanza el
  // contraste mínimo: para ese texto se usa uno más oscuro.
  suaveFuera: '#58616f',
};
const FUENTE = "'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Escala "bonita": techo redondeado hacia arriba para el eje. */
function techo(max) {
  if (max <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(max)));
  for (const paso of [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10]) {
    if (max <= paso * exp) return paso * exp;
  }
  return 10 * exp;
}

/**
 * Un gráfico por escenario: barras con las peticiones por segundo (eje
 * derecho) y líneas con las latencias p50, p95 y p99 (eje izquierdo).
 */
function graficoEscenario(escenario) {
  const W = 920;
  const H = 380;
  const M = { arriba: 58, derecha: 68, abajo: 64, izquierda: 68 };
  const ancho = W - M.izquierda - M.derecha;
  const alto = H - M.arriba - M.abajo;

  const medidas = escenario.medidas;
  const maxLat = techo(Math.max(...medidas.map((m) => m.latencia.p99)));
  const maxRps = techo(Math.max(...medidas.map((m) => m.rps)));

  const paso = ancho / medidas.length;
  const x = (i) => M.izquierda + paso * i + paso / 2;
  const yLat = (v) => M.arriba + alto - (v / maxLat) * alto;
  const yRps = (v) => M.arriba + alto - (v / maxRps) * alto;

  const partes = [];
  partes.push(`<rect width="${W}" height="${H}" fill="#ffffff"/>`);
  partes.push(
    `<text x="${M.izquierda}" y="30" font-family="${FUENTE}" font-size="17" font-weight="600" fill="${COLOR.texto}">${esc(escenario.nombre)}</text>`
  );

  // Rejilla y eje de latencia (izquierda).
  for (let i = 0; i <= 4; i++) {
    const v = (maxLat / 4) * i;
    const y = yLat(v);
    partes.push(
      `<line x1="${M.izquierda}" y1="${y}" x2="${M.izquierda + ancho}" y2="${y}" stroke="${COLOR.rejilla}" stroke-width="1"/>`
    );
    partes.push(
      `<text x="${M.izquierda - 10}" y="${y + 4}" text-anchor="end" font-family="${FUENTE}" font-size="12" fill="${COLOR.suave}">${Math.round(v)}</text>`
    );
  }
  // Eje de peticiones por segundo (derecha).
  for (let i = 0; i <= 4; i++) {
    const v = (maxRps / 4) * i;
    partes.push(
      `<text x="${M.izquierda + ancho + 10}" y="${yRps(v) + 4}" font-family="${FUENTE}" font-size="12" fill="${COLOR.suave}">${Math.round(v)}</text>`
    );
  }

  // Barras de throughput.
  const anchoBarra = Math.min(54, paso * 0.46);
  for (const [i, m] of medidas.entries()) {
    const y = yRps(m.rps);
    partes.push(
      `<rect x="${x(i) - anchoBarra / 2}" y="${y}" width="${anchoBarra}" height="${M.arriba + alto - y}" fill="${COLOR.barra}" stroke="${COLOR.barraBorde}" stroke-width="1" rx="2"/>`
    );
    partes.push(
      `<text x="${x(i)}" y="${y - 7}" text-anchor="middle" font-family="${FUENTE}" font-size="12" fill="${COLOR.suave}">${m.rps}</text>`
    );
  }

  // Líneas de latencia.
  for (const [clave, color, etiqueta] of [
    ['p50', COLOR.p50, 'p50'],
    ['p95', COLOR.p95, 'p95'],
    ['p99', COLOR.p99, 'p99'],
  ]) {
    const puntos = medidas.map((m, i) => `${x(i)},${yLat(m.latencia[clave])}`).join(' ');
    partes.push(`<polyline points="${puntos}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round"/>`);
    for (const [i, m] of medidas.entries()) {
      partes.push(`<circle cx="${x(i)}" cy="${yLat(m.latencia[clave])}" r="4" fill="#fff" stroke="${color}" stroke-width="2.5"/>`);
    }
    void etiqueta;
  }

  // Ejes y etiquetas del eje X.
  partes.push(
    `<line x1="${M.izquierda}" y1="${M.arriba + alto}" x2="${M.izquierda + ancho}" y2="${M.arriba + alto}" stroke="${COLOR.eje}" stroke-width="1"/>`
  );
  for (const [i, m] of medidas.entries()) {
    partes.push(
      `<text x="${x(i)}" y="${M.arriba + alto + 22}" text-anchor="middle" font-family="${FUENTE}" font-size="13" fill="${COLOR.texto}">${m.concurrencia}</text>`
    );
  }
  partes.push(
    `<text x="${M.izquierda + ancho / 2}" y="${H - 16}" text-anchor="middle" font-family="${FUENTE}" font-size="13" fill="${COLOR.suave}">Peticiones en paralelo</text>`
  );
  partes.push(
    `<text transform="translate(18 ${M.arriba + alto / 2}) rotate(-90)" text-anchor="middle" font-family="${FUENTE}" font-size="13" fill="${COLOR.suave}">Latencia (ms)</text>`
  );
  partes.push(
    `<text transform="translate(${W - 16} ${M.arriba + alto / 2}) rotate(-90)" text-anchor="middle" font-family="${FUENTE}" font-size="13" fill="${COLOR.suave}">Peticiones por segundo</text>`
  );

  // Leyenda.
  const leyenda = [
    ['Peticiones/s', COLOR.barra, true],
    ['Latencia p50', COLOR.p50, false],
    ['p95', COLOR.p95, false],
    ['p99', COLOR.p99, false],
  ];
  let lx = M.izquierda + 270;
  for (const [texto, color, esBarra] of leyenda) {
    partes.push(
      esBarra
        ? `<rect x="${lx}" y="20" width="13" height="13" fill="${color}" stroke="${COLOR.barraBorde}"/>`
        : `<line x1="${lx}" y1="27" x2="${lx + 14}" y2="27" stroke="${color}" stroke-width="3"/>`
    );
    partes.push(
      `<text x="${lx + 20}" y="31" font-family="${FUENTE}" font-size="12.5" fill="${COLOR.suave}">${esc(texto)}</text>`
    );
    lx += 26 + texto.length * 7.2;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(escenario.nombre)}">${partes.join('')}</svg>`;
}

/** Gráfico de resumen: el máximo de peticiones por segundo de cada escenario. */
function graficoResumen() {
  const W = 920;
  const H = 300;
  const M = { arriba: 56, derecha: 28, abajo: 76, izquierda: 68 };
  const ancho = W - M.izquierda - M.derecha;
  const alto = H - M.arriba - M.abajo;

  const filas = datos.escenarios.map((e) => ({
    nombre: e.nombre.replace(/^\d+\.\s*/, ''),
    rps: Math.max(...e.medidas.map((m) => m.rps)),
  }));
  const max = techo(Math.max(...filas.map((f) => f.rps)));
  const paso = ancho / filas.length;
  const y = (v) => M.arriba + alto - (v / max) * alto;

  const partes = [`<rect width="${W}" height="${H}" fill="#ffffff"/>`];
  partes.push(
    `<text x="${M.izquierda}" y="30" font-family="${FUENTE}" font-size="17" font-weight="600" fill="${COLOR.texto}">Capacidad máxima medida por escenario</text>`
  );
  for (let i = 0; i <= 4; i++) {
    const v = (max / 4) * i;
    partes.push(
      `<line x1="${M.izquierda}" y1="${y(v)}" x2="${M.izquierda + ancho}" y2="${y(v)}" stroke="${COLOR.rejilla}"/>` +
        `<text x="${M.izquierda - 10}" y="${y(v) + 4}" text-anchor="end" font-family="${FUENTE}" font-size="12" fill="${COLOR.suave}">${Math.round(v)}</text>`
    );
  }
  for (const [i, f] of filas.entries()) {
    const cx = M.izquierda + paso * i + paso / 2;
    const ancho2 = Math.min(110, paso * 0.5);
    partes.push(
      `<rect x="${cx - ancho2 / 2}" y="${y(f.rps)}" width="${ancho2}" height="${M.arriba + alto - y(f.rps)}" fill="${COLOR.p50}" rx="2"/>`
    );
    partes.push(
      `<text x="${cx}" y="${y(f.rps) - 8}" text-anchor="middle" font-family="${FUENTE}" font-size="13" font-weight="600" fill="${COLOR.texto}">${f.rps}</text>`
    );
    const palabras = f.nombre.split(' ');
    const linea1 = palabras.slice(0, 2).join(' ');
    const linea2 = palabras.slice(2).join(' ');
    partes.push(
      `<text x="${cx}" y="${M.arriba + alto + 22}" text-anchor="middle" font-family="${FUENTE}" font-size="12.5" fill="${COLOR.texto}">${esc(linea1)}</text>` +
        `<text x="${cx}" y="${M.arriba + alto + 39}" text-anchor="middle" font-family="${FUENTE}" font-size="12.5" fill="${COLOR.texto}">${esc(linea2)}</text>`
    );
  }
  partes.push(
    `<line x1="${M.izquierda}" y1="${M.arriba + alto}" x2="${M.izquierda + ancho}" y2="${M.arriba + alto}" stroke="${COLOR.eje}"/>`
  );
  partes.push(
    `<text transform="translate(18 ${M.arriba + alto / 2}) rotate(-90)" text-anchor="middle" font-family="${FUENTE}" font-size="13" fill="${COLOR.suave}">Peticiones por segundo</text>`
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${partes.join('')}</svg>`;
}

function tabla(escenario) {
  const filas = escenario.medidas
    .map(
      (m) => `      <tr>
        <td class="num">${m.concurrencia}</td>
        <td class="num">${m.peticiones}</td>
        <td class="num">${m.rps}</td>
        <td class="num">${m.latencia.p50}</td>
        <td class="num">${m.latencia.p95}</td>
        <td class="num">${m.latencia.p99}</td>
        <td class="num">${m.latencia.max}</td>
        <td>${Object.entries(m.estados).map(([c, n]) => `${c} × ${n}`).join(', ')}</td>
      </tr>`
    )
    .join('\n');
  return `<table>
    <thead>
      <tr>
        <th>En paralelo</th><th>Peticiones</th><th>Pet./s</th>
        <th>p50 (ms)</th><th>p95 (ms)</th><th>p99 (ms)</th><th>Máx. (ms)</th><th>Respuestas</th>
      </tr>
    </thead>
    <tbody>
${filas}
    </tbody>
  </table>`;
}

/** La proyección a la nube, con su advertencia por delante. */
function seccionNube() {
  const filas = datos.escenarios
    .map((e) => {
      const n = NUBE[e.id];
      if (!n) return '';
      const local = Math.max(...e.medidas.map((m) => m.rps));
      return `      <tr>
        <td>${esc(e.nombre.replace(/^\d+\.\s*/, ''))}</td>
        <td class="num">${local}</td>
        <td class="num">${String(n.rango[0]).replace(".", ",")} – ${String(n.rango[1]).replace(".", ",")}</td>
        <td>${esc(n.limite)}</td>
      </tr>`;
    })
    .join('\n');

  return `  <section>
    <h2>Qué esperar en el despliegue en la nube</h2>
    <p class="aviso"><b>Esto es una proyección, no una medición.</b> Las cifras de arriba se midieron contra
      el entorno local; las de esta sección son lo que cabe esperar del backend publicado en el plan
      gratuito de Render (512 MB, una fracción de CPU compartida, región Ohio) con la base de datos en Neon.
      Se incluyen porque es la pregunta natural al ver los números locales, y se marcan como estimación
      para que nadie las confunda con un dato.</p>

    <p class="desc">Entre la máquina de prueba y ese despliegue hay tres saltos hacia abajo. El primero es la
      <b>CPU</b>: localmente el backend dispone de un procesador completo y PostgreSQL corre en los núcleos
      de al lado, mientras que el plan gratuito entrega una fracción de un núcleo compartido y más lento, lo
      que da del orden de diez a quince veces menos capacidad de cálculo. El segundo es que <b>la base deja
      de estar al lado</b>: cada consulta pasa de costar microsegundos en memoria a cruzar la red hasta Neon,
      y el agendado hace varias dentro de una misma transacción con el bloqueo tomado, así que es el
      escenario que más se degrada. El tercero no afecta la capacidad pero sí lo que siente el usuario: entre
      Chile y Ohio hay cerca de 150 a 200 ms de ida y vuelta, de modo que una pantalla que hace tres
      llamadas se siente medio segundo más lenta aunque el servidor conteste al instante.</p>

    <table class="nube">
      <thead>
        <tr><th>Escenario</th><th>Local (medido)</th><th>En la nube (estimado)</th><th>Qué lo limita</th></tr>
      </thead>
      <tbody>
${filas}
      </tbody>
    </table>

    <p class="desc" style="margin-top:20px"><b>El límite real no es la velocidad, son los 512 MB.</b> Al subir
      un boceto, la biblioteca de imágenes descomprime el archivo en memoria —un JPEG de 5 MB puede ocupar
      más de 100 MB mientras se procesa— y la petición ya traía el archivo entero en RAM. Dos o tres subidas
      simultáneas pueden pasarse del tope, y cuando eso ocurre el proveedor mata el proceso y lo reinicia:
      el usuario ve un error, no una lentitud. Ese es el punto que conviene vigilar, y no las peticiones por
      segundo. Después vienen, en este orden, el minuto que tarda el servidor en despertar tras quince
      minutos sin uso, los 0,5 GB de la base, los créditos mensuales del servicio de imágenes y las 750 horas
      de cómputo al mes, que alcanzan justo para un servicio encendido todo el mes.</p>

    <p class="desc"><b>Puesto en términos de uso real:</b> un tatuador hace del orden de cien o doscientas
      peticiones en un día de trabajo. Aun tomando la estimación más pesimista de la tabla, diez peticiones
      por segundo sostenidas son treinta y seis mil por hora, de modo que la capacidad de cálculo alcanzaría
      para varias decenas de estudios trabajando a la vez. Lo que se rompería antes es la memoria durante las
      subidas simultáneas y el cupo de almacenamiento de imágenes.</p>

    <p class="pista">Para reemplazar esta estimación por una medición: despertar el servicio, correr
      <code>BASE=https://… node backend/stress/correr.js</code> con concurrencia baja durante medio minuto
      por nivel, y mirar el panel de memoria del proveedor mientras tanto. Con esa carga no hay riesgo de
      infringir el uso aceptable del plan gratuito.</p>
  </section>`;
}

// ------------------------------------------------------------------ salida

fs.mkdirSync(IMG, { recursive: true });

const svgs = [['resumen', graficoResumen()]];
for (const e of datos.escenarios) svgs.push([e.id, graficoEscenario(e)]);

const fecha = new Date(datos.fecha);
const fechaTexto = fecha.toLocaleString('es-CL', { dateStyle: 'long', timeStyle: 'short' });

const secciones = datos.escenarios
  .map(
    (e) => `  <section class="escenario">
    <h2>${esc(e.nombre)}</h2>
    <p class="desc">${esc(e.descripcion)}</p>
    <figure>${graficoEscenario(e)}</figure>
    ${tabla(e)}
  </section>`
  )
  .join('\n');

const c = datos.colision;
const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pruebas de carga — Plataforma para estudios de tatuaje</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 40px 24px 72px;
    font-family: ${FUENTE};
    color: ${COLOR.texto}; background: #f4f6f8; line-height: 1.55;
  }
  main { max-width: 1000px; margin: 0 auto; }
  h1 { font-size: 30px; margin: 0 0 6px; letter-spacing: -.01em; }
  .sub { color: ${COLOR.suaveFuera}; margin: 0 0 28px; font-size: 15px; }
  section { background: #fff; border: 1px solid #e3e7ec; border-radius: 10px; padding: 26px 28px; margin-bottom: 22px; }
  h2 { font-size: 19px; margin: 0 0 8px; }
  .desc { color: ${COLOR.suave}; margin: 0 0 18px; font-size: 14.5px; max-width: 78ch; }
  figure { margin: 0 0 18px; overflow-x: auto; }
  svg { max-width: 100%; height: auto; display: block; }
  table { border-collapse: collapse; width: 100%; font-size: 14px; }
  th, td { border-bottom: 1px solid #eceff3; padding: 7px 10px; text-align: left; }
  th { font-size: 12.5px; text-transform: uppercase; letter-spacing: .04em; color: ${COLOR.suave}; font-weight: 600; }
  td.num, th:not(:last-child) { text-align: right; }
  table.nube th:first-child { text-align: left; }
  td.num { font-variant-numeric: tabular-nums; }
  .tarjetas { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 14px; margin: 0 0 4px; }
  .tarjeta { background: #f8fafc; border: 1px solid #e3e7ec; border-radius: 8px; padding: 14px 16px; }
  .tarjeta .n { font-size: 26px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .tarjeta .t { font-size: 13px; color: ${COLOR.suave}; }
  .ok { color: #1f7a44; }
  .entorno { font-size: 14px; color: ${COLOR.suave}; }
  .aviso { background: #fff8e6; border: 1px solid #f0dca8; border-radius: 8px; padding: 14px 18px; margin: 0 0 18px; font-size: 14.5px; }
  .pista { font-size: 14px; color: ${COLOR.suave}; margin: 18px 0 0; border-left: 3px solid ${COLOR.barra}; padding-left: 14px; }
  .entorno b { color: ${COLOR.texto}; font-weight: 600; }
  footer { max-width: 1000px; margin: 0 auto; color: ${COLOR.suaveFuera}; font-size: 13.5px; }
  code { background: #eef1f5; padding: 1px 6px; border-radius: 4px; font-size: 13px; }
</style>
</head>
<body>
<main>
  <h1>Pruebas de carga y estrés</h1>
  <p class="sub">Plataforma de gestión para estudios de tatuaje · ${esc(fechaTexto)}</p>

  <section>
    <h2>Resumen</h2>
    <div class="tarjetas">
      ${datos.escenarios
        .map((e) => {
          const mejor = Math.max(...e.medidas.map((m) => m.rps));
          return `<div class="tarjeta"><div class="n">${mejor}</div><div class="t">pet./s — ${esc(e.nombre.replace(/^\d+\.\s*/, ''))}</div></div>`;
        })
        .join('\n      ')}
      <div class="tarjeta"><div class="n ok">${c.creadas} de ${c.intentos}</div><div class="t">citas creadas al pedir ${c.intentos} veces la misma hora</div></div>
    </div>
    <figure>${graficoResumen()}</figure>
    <p class="entorno">
      <b>Servidor:</b> ${esc(datos.entorno.servidor)}.
      <b>Generador de carga:</b> ${esc(datos.entorno.generador)}.
      <b>Máquina:</b> ${esc(datos.entorno.cpu)} (${datos.entorno.nucleos} hilos), ${datos.entorno.memoriaGB} GB de RAM.
      El generador corre en la misma máquina que el servidor, de modo que los tiempos miden la aplicación y no la red.
    </p>
  </section>

${secciones}

  <section class="escenario">
    <h2>5. Colisión: ${c.intentos} peticiones pidiendo la misma hora a la vez</h2>
    <p class="desc">Es la prueba que de verdad somete a estrés la regla del sistema: todas las peticiones salen al mismo tiempo pidiendo exactamente el mismo horario. El bloqueo por artista tiene que dejar pasar una sola.</p>
    <div class="tarjetas">
      <div class="tarjeta"><div class="n ok">${c.creadas}</div><div class="t">cita creada (201)</div></div>
      <div class="tarjeta"><div class="n">${c.rechazadas}</div><div class="t">rechazadas por choque (409)</div></div>
      <div class="tarjeta"><div class="n">${c.otros}</div><div class="t">errores o respuestas inesperadas</div></div>
      <div class="tarjeta"><div class="n">${c.duracionMs} ms</div><div class="t">en resolver las ${c.intentos}</div></div>
    </div>
    <p class="desc" style="margin-top:16px">Latencias de esas ${c.intentos} peticiones: p50 ${c.latencia.p50} ms, p95 ${c.latencia.p95} ms, máximo ${c.latencia.max} ms.</p>
  </section>

${seccionNube()}
</main>
<footer>
  Generado desde <code>docs/pruebas-estres/resultados.json</code>. Para repetir la medición:
  <code>node backend/stress/correr.js</code> y luego <code>node backend/stress/informe.js</code>.
  La corrida crea su propia cuenta de prueba y borra al terminar todo lo que creó.
</footer>
</body>
</html>
`;

fs.writeFileSync(path.join(DIR, 'index.html'), html);
console.log('informe:', path.join(DIR, 'index.html'));

(async () => {
  for (const [id, svg] of svgs) {
    const destino = path.join(IMG, `${id}.png`);
    await sharp(Buffer.from(svg), { density: 192 }).png({ compressionLevel: 9 }).toFile(destino);
    const m = await sharp(destino).metadata();
    console.log(`imagen: ${path.relative(process.cwd(), destino)}  ${m.width}x${m.height}`);
  }
})();
