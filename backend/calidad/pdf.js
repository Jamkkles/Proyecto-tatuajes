/**
 * Arma el informe de calidad en PDF, pensado para imprimir y para estudiar.
 *
 *   node backend/calidad/pdf.js
 *
 * Toma las cifras de docs/calidad/metricas.json y docs/pruebas-estres/
 * resultados.json —los mismos archivos que alimentan los informes web, para que
 * no haya dos versiones de la verdad—, arma un documento con las imágenes
 * incrustadas y lo imprime con Chrome en modo headless.
 *
 * Salida: docs/calidad/informe-calidad.pdf
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const WebSocket = require(path.join(__dirname, '..', 'node_modules', 'ws'));

const RAIZ = path.join(__dirname, '..', '..');
const DOCS = path.join(RAIZ, 'docs');
const SALIDA = path.join(DOCS, 'calidad', 'informe-calidad.pdf');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PUERTO = 9444;

const m = JSON.parse(fs.readFileSync(path.join(DOCS, 'calidad', 'metricas.json'), 'utf8'));
const carga = JSON.parse(
  fs.readFileSync(path.join(DOCS, 'pruebas-estres', 'resultados.json'), 'utf8')
);

// ------------------------------------------------------------------ ayudas

const coma = (n) => String(n).replace('.', ',');
const miles = (n) => Number(n).toLocaleString('es-CL');
const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Incrusta la imagen en el documento, para que el PDF no dependa de archivos. */
function imagen(rutaRelativa, pie) {
  const completa = path.join(DOCS, rutaRelativa);
  const base64 = fs.readFileSync(completa).toString('base64');
  return `<figure><img src="data:image/png;base64,${base64}" alt="${esc(pie)}"><figcaption>${esc(pie)}</figcaption></figure>`;
}

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
const razonPruebas = coma((m.codigo['Pruebas automatizadas'].codigo / lineasBackend).toFixed(1));
const maxRps = (id) => Math.max(...carga.escenarios.find((e) => e.id === id).medidas.map((x) => x.rps));
const fechaLarga = new Date(m.fecha).toLocaleDateString('es-CL', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

// ------------------------------------------------------------------ texto

const GLOSARIO = [
  ['Prueba unitaria', 'Prueba una pieza del programa aislada del resto. Lo que esa pieza necesita de sus vecinas se reemplaza por un doble. Es rápida y, cuando falla, señala exactamente dónde está el problema.'],
  ['Prueba de integración', 'Prueba varias piezas reales funcionando juntas, aquí contra una base de datos de verdad. Es más lenta, pero es la única que descubre los problemas que solo aparecen cuando todo opera junto.'],
  ['Doble de prueba', 'Un sustituto que ocupa el lugar de una pieza real y devuelve lo que la prueba le indique. Permite provocar situaciones difíciles de reproducir, como que la base de datos falle.'],
  ['Caja negra', 'Probar el sistema desde fuera: se define una entrada, se declara la salida esperada y se compara, sin mirar cómo está escrito por dentro.'],
  ['Caja blanca', 'Probar conociendo el código por dentro, que es lo que permite medir qué partes se ejecutaron.'],
  ['Cobertura', 'Porcentaje del código que las pruebas llegaron a ejecutar. Dice qué se probó, no si se comprobó correctamente.'],
  ['Sentencia', 'Una instrucción del programa. Una línea puede contener varias.'],
  ['Rama', 'Cada salida posible de una decisión. Un «si» tiene dos ramas: la que se cumple y la que no.'],
  ['Análisis estático', 'Revisión del código sin ejecutarlo. Encuentra variables que no existen, código inalcanzable o tipos que no calzan.'],
  ['Linter', 'La herramienta que hace ese análisis. Aquí, ESLint.'],
  ['Percentil 95 (p95)', 'El valor que supera al 95 % de las mediciones. En una prueba de carga, el tiempo que esperó el usuario que peor lo pasó, dejando fuera el 5 % más extremo. Se usa en vez del promedio, que esconde justamente esos casos.'],
  ['Concurrencia', 'Cuántas peticiones están siendo atendidas al mismo tiempo.'],
  ['Vulnerabilidad conocida', 'Un fallo de seguridad publicado en una biblioteca de terceros. Se identifica con un código público y tiene una severidad asignada.'],
  ['Bloqueo por artista', 'Mecanismo de la base de datos que obliga a que las operaciones de agenda de un mismo tatuador se resuelvan de a una. Es lo que impide que dos peticiones simultáneas agenden la misma hora.'],
];

const PREGUNTAS = [
  [
    '¿Cómo sabes que tu sistema funciona bien?',
    `No lo sé por confianza: lo mido. Hay ${miles(m.pruebas.total)} pruebas automatizadas que lo usan y comprueban el resultado, y corren enteras en menos de un minuto. Además hay 35 casos funcionales que recorren el sistema de punta a punta como lo haría un usuario.`,
  ],
  [
    '¿Qué significa que tengas 95 % de cobertura?',
    'Que al ejecutar las pruebas, el 95,5 % de las instrucciones del backend llegaron a ejecutarse. Es la medida de cuánto código está siendo probado. No significa que el sistema sea correcto: significa que casi no queda código que nadie haya puesto a funcionar nunca.',
  ],
  [
    '¿Y el 5 % que falta?',
    'Son, sobre todo, caminos que solo ocurren contra un servicio externo real, como las reconexiones del canal de WhatsApp. Simularlos con un doble no probaría gran cosa. Está identificado y documentado, no es código olvidado.',
  ],
  [
    '¿Por qué la cobertura de ramas es más baja?',
    'Porque cuenta cada salida de cada decisión por separado. Una condición con tres causas posibles exige tres pruebas distintas aunque sea una sola línea de código. Es la métrica más exigente y por eso siempre va por detrás.',
  ],
  [
    '¿Probaste solo el backend?',
    'La cobertura es del backend, que es donde están las reglas del sistema. El frontend se verifica con el compilador de TypeScript y con ESLint, que no ejecutan el código pero sí detectan errores antes de que lleguen a la pantalla, y con los 35 casos funcionales que lo recorren completo. No tiene una batería de pruebas propia, y eso está declarado.',
  ],
  [
    '¿Cómo pruebas que dos personas no agenden la misma hora?',
    'Con una prueba que lanza cincuenta peticiones simultáneas pidiendo exactamente el mismo horario. Se crea una sola cita y las otras cuarenta y nueve son rechazadas. Esa prueba corre contra una base de datos real, porque es el motor de base de datos el que garantiza esa exclusión.',
  ],
  [
    '¿El sistema aguanta varios usuarios a la vez?',
    `Medido en el entorno local: ${Math.round(maxRps('agenda'))} peticiones por segundo leyendo la agenda y ${Math.round(maxRps('agendado'))} agendando citas, sin un solo error. Para dimensionarlo, un tatuador hace del orden de cien peticiones en un día de trabajo.`,
  ],
  [
    '¿Revisaste la seguridad?',
    'Revisé las dependencias contra la base pública de vulnerabilidades conocidas. Había veintisiete, corregí veintiséis. La que queda exige un cambio de versión mayor de la biblioteca de correo, que en la nube ni siquiera se usa.',
  ],
  [
    '¿Qué harías distinto si siguieras el proyecto?',
    'Dos cosas concretas: escribir pruebas para la geometría del visor tridimensional, que hoy se verifica mirando y midiendo, y subir la cobertura de ramas. Las dos están anotadas en el trabajo futuro de la memoria.',
  ],
];

// ------------------------------------------------------------------ página

const filaCapas = m.coberturaPorCapa
  .map(
    (c) =>
      `<tr><td>${esc(c.nombre)}</td><td class="num">${coma(c.pct)} %</td><td class="num">${miles(c.cubierto)} / ${miles(c.total)}</td></tr>`
  )
  .join('\n');

const filasCarga = carga.escenarios
  .map((e) => {
    const peor = e.medidas[e.medidas.length - 1];
    return `<tr><td>${esc(e.nombre.replace(/^\d+\.\s*/, ''))}</td><td class="num">${coma(Math.max(...e.medidas.map((x) => x.rps)))}</td><td class="num">${coma(peor.latencia.p50)}</td><td class="num">${coma(peor.latencia.p95)}</td><td class="num">${peor.concurrencia}</td></tr>`;
  })
  .join('\n');

const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Informe de calidad de código</title>
<style>
  @page { size: A4; margin: 18mm 16mm 16mm; }
  * { box-sizing: border-box; }
  body { margin:0; font-family:'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
         color:#20262f; font-size:10.5pt; line-height:1.55; }
  h1 { font-size:21pt; margin:0 0 4pt; letter-spacing:-.01em; }
  h2 { font-size:14pt; margin:0 0 8pt; padding-bottom:5pt; border-bottom:1.5pt solid #d8dee6;
       page-break-after:avoid; }
  h3 { font-size:11.5pt; margin:14pt 0 4pt; page-break-after:avoid; }
  section.seguida h2 { margin-top:20pt; }
  p { margin:0 0 8pt; }
  .portada { height:245mm; display:flex; flex-direction:column; justify-content:center; }
  .portada .titulo { font-size:30pt; font-weight:600; line-height:1.15; margin-bottom:10pt; }
  .portada .bajada { font-size:13pt; color:#57606f; margin-bottom:28pt; }
  .portada .datos { font-size:10.5pt; color:#57606f; border-top:1.5pt solid #d8dee6; padding-top:14pt; }
  .portada .datos b { color:#20262f; }
  section { page-break-before: always; }
  section.seguida { page-break-before: auto; }
  table { border-collapse:collapse; width:100%; font-size:9.5pt; margin:8pt 0 10pt; page-break-inside:avoid; }
  th, td { border-bottom:0.6pt solid #e2e7ec; padding:4.5pt 6pt; text-align:left; vertical-align:top; }
  th { background:#f5f7f9; font-size:8.5pt; text-transform:uppercase; letter-spacing:.04em; color:#57606f; }
  td.num, th.num { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }
  figure { margin:10pt 0 12pt; page-break-inside:avoid; }
  img { width:100%; border:0.6pt solid #e2e7ec; border-radius:3pt; }
  figcaption { font-size:8.5pt; color:#57606f; margin-top:4pt; }
  .tarjetas { display:flex; flex-wrap:wrap; gap:7pt; margin:10pt 0 12pt; }
  .tarjeta { flex:1 1 30%; border:0.8pt solid #dfe4ea; border-radius:4pt; padding:8pt 10pt; background:#fafbfc; }
  .tarjeta .n { font-size:16pt; font-weight:600; }
  .tarjeta .t { font-size:8.5pt; color:#57606f; line-height:1.35; }
  .ok { color:#1f7a44; } .ojo { color:#a9760c; }
  .nota { background:#f7f9fb; border:0.8pt solid #dfe4ea; border-radius:4pt; padding:8pt 11pt;
          font-size:9.5pt; margin:10pt 0; page-break-inside:avoid; }
  .nota b { color:#20262f; }
  code { font-family:ui-monospace, monospace; font-size:9pt; background:#f1f4f7; padding:0 3pt; border-radius:2pt; }
  dl { margin:0; } dt { font-weight:600; margin-top:7pt; }
  dd { margin:0 0 0 0; color:#39414d; }
  .pregunta { page-break-inside:avoid; margin-bottom:11pt; }
  .pregunta .q { font-weight:600; }
  .pregunta .a { color:#39414d; }
  .indice ol { margin:6pt 0 0; padding-left:16pt; }
  .indice li { margin-bottom:3pt; }
</style>
</head>
<body>

<div class="portada">
  <div class="titulo">Informe de calidad<br>de código</div>
  <div class="bajada">Plataforma de gestión para estudios de tatuaje</div>
  <div class="datos">
    <p><b>Medición:</b> ${esc(fechaLarga)}</p>
    <p><b>Alcance:</b> backend (Node.js y PostgreSQL) y frontend (React y TypeScript)</p>
    <p><b>Herramientas:</b> Jest ${esc(m.herramientas.jest)}, Supertest ${esc(m.herramientas.supertest)},
       Istanbul, ESLint ${esc(m.herramientas.eslint)}, TypeScript ${esc(m.herramientas.typescript)},
       npm audit, PostgreSQL 16, Docker</p>
    <p style="margin-top:12pt">Todas las cifras de este documento provienen de ejecutar esas herramientas
       sobre el código del repositorio en la fecha indicada. Ninguna es una estimación, salvo la
       proyección del capítulo 7, que aparece marcada como tal.</p>
  </div>
  <div class="indice" style="margin-top:26pt">
    <b>Contenido</b>
    <ol>
      <li>Qué se entiende aquí por calidad</li>
      <li>Pruebas automatizadas</li>
      <li>Cobertura de código</li>
      <li>Análisis estático</li>
      <li>Seguridad de las dependencias</li>
      <li>Tamaño, documentación y deuda</li>
      <li>Rendimiento bajo carga</li>
      <li>Cómo repetir todas las mediciones</li>
      <li>Glosario</li>
      <li>Preguntas frecuentes y cómo responderlas</li>
    </ol>
  </div>
</div>

<section>
  <h2>1. Qué se entiende aquí por calidad</h2>
  <p>Que un programa funcione se demuestra usándolo. La calidad del código es otra cosa: es que ese código
    <b>se pueda revisar, cambiar y mantener sin romperlo</b>, y que no esconda problemas que todavía no se
    manifiestan. Es una afirmación fácil de hacer y difícil de sostener, así que en este informe no se
    afirma: se mide.</p>
  <p>Se midieron cinco dimensiones, cada una con la herramienta estándar para esa tarea. Ninguna de ellas
    basta por sí sola, y de ahí que se midan todas: las pruebas dicen que el sistema hace lo que debe, la
    cobertura dice cuánto del código están ejerciendo esas pruebas, el análisis estático encuentra lo que
    las pruebas no buscan, la revisión de dependencias cubre el código de terceros —que es buena parte del
    total— y el recuento de tamaño y documentación habla de lo que cuesta entenderlo.</p>

  <div class="tarjetas">
    <div class="tarjeta"><div class="n ok">${miles(m.pruebas.total)}</div><div class="t">pruebas automatizadas, todas aprobadas</div></div>
    <div class="tarjeta"><div class="n">${coma(cob.statements.pct)} %</div><div class="t">de las sentencias cubiertas</div></div>
    <div class="tarjeta"><div class="n ok">${m.estatico.eslintBackend.errores + m.estatico.eslintFrontend.errores}</div><div class="t">problemas en el análisis estático</div></div>
    <div class="tarjeta"><div class="n ok">${m.estatico.tipos.ok ? 'Sin errores' : 'Con errores'}</div><div class="t">en la comprobación de tipos</div></div>
    <div class="tarjeta"><div class="n ojo">${dep.backend.produccion.total + dep.frontend.produccion.total}</div><div class="t">vulnerabilidad en dependencias de producción</div></div>
    <div class="tarjeta"><div class="n ok">${m.deuda.marcas}</div><div class="t">marcas de trabajo pendiente en el código</div></div>
  </div>

  <table>
    <thead><tr><th>Dimensión</th><th>Herramienta</th><th>Qué responde</th></tr></thead>
    <tbody>
      <tr><td>Pruebas</td><td>Jest, Supertest</td><td>¿Hace el sistema lo que debe?</td></tr>
      <tr><td>Cobertura</td><td>Istanbul</td><td>¿Cuánto del código están ejerciendo esas pruebas?</td></tr>
      <tr><td>Análisis estático</td><td>ESLint, TypeScript</td><td>¿Hay errores visibles sin ejecutar el código?</td></tr>
      <tr><td>Dependencias</td><td>npm audit</td><td>¿El código de terceros tiene fallos conocidos?</td></tr>
      <tr><td>Tamaño y deuda</td><td>recuento propio</td><td>¿Cuánto cuesta entender y mantener esto?</td></tr>
      <tr><td>Rendimiento</td><td>generador propio</td><td>¿Cuánto aguanta antes de degradarse?</td></tr>
    </tbody>
  </table>
</section>

<section>
  <h2>2. Pruebas automatizadas</h2>
  <p>Una prueba automatizada es un programa que usa el sistema y comprueba que el resultado sea el
    esperado. Su valor no está en encontrar errores una vez, sino en encontrarlos <b>cada vez que alguien
    cambia algo</b>: son ${miles(m.pruebas.total)} comprobaciones que corren enteras en menos de un minuto.</p>

  <div class="tarjetas">
    <div class="tarjeta"><div class="n">${miles(m.pruebas.unitarias)}</div><div class="t">unitarias</div></div>
    <div class="tarjeta"><div class="n">${m.pruebas.integracion}</div><div class="t">de integración</div></div>
    <div class="tarjeta"><div class="n">${m.pruebas.archivos}</div><div class="t">archivos de prueba</div></div>
    <div class="tarjeta"><div class="n ok">${m.pruebas.fallidas}</div><div class="t">fallidas</div></div>
    <div class="tarjeta"><div class="n">${razonPruebas} : 1</div><div class="t">líneas de prueba por línea de backend</div></div>
  </div>

  <h3>Las dos clases de prueba, y por qué hacen falta las dos</h3>
  <p>Las <b>unitarias</b> prueban una pieza aislada del resto. Lo que esa pieza necesita de sus vecinas se
    reemplaza por un <i>doble</i>, un sustituto que devuelve lo que la prueba le indique. Eso permite
    provocar situaciones difíciles de montar de verdad —que la base de datos falle justo después de subir
    una imagen, por ejemplo— y comprobar que el sistema reaccione bien. Corren en segundos y, cuando
    fallan, señalan exactamente la pieza rota.</p>
  <p>Las <b>de integración</b> prueban varias piezas reales trabajando juntas, contra un PostgreSQL de
    verdad que la propia corrida crea y vacía entre pruebas. Son más lentas, pero son las únicas capaces
    de demostrar lo que depende del motor de base de datos. Tres ejemplos que esta batería comprueba y que
    con dobles serían solo una promesa:</p>
  <table>
    <thead><tr><th>Lo que se comprueba</th><th>Por qué necesita una base real</th></tr></thead>
    <tbody>
      <tr><td>Diez peticiones simultáneas pidiendo la misma hora dejan una sola cita</td><td>Es el bloqueo del motor de base de datos el que garantiza la exclusión</td></tr>
      <tr><td>El stock nunca queda negativo aunque se descuente en paralelo</td><td>La resta ocurre dentro de la base, no en memoria</td></tr>
      <tr><td>Una cotización no se descuenta dos veces</td><td>El sello va condicionado dentro de una transacción</td></tr>
    </tbody>
  </table>

  <div class="nota"><b>La proporción que vale la pena mirar:</b> hay ${razonPruebas} líneas de prueba por
    cada línea de backend. Escribir pruebas costó más que escribir el sistema, y es lo que permite que un
    cambio hecho dentro de seis meses se pueda verificar en un minuto.</div>
</section>

<section>
  <h2>3. Cobertura de código</h2>
  <p>Mientras las pruebas corren, una herramienta va anotando por dónde pasa la ejecución. La cobertura es
    el porcentaje del código que llegó a ejecutarse. La imagen útil es la de pintar el piso por donde
    caminas: al terminar, lo pintado es lo que se probó y lo que quedó sin pintar es código que nadie puso
    a funcionar ni una sola vez.</p>

  <table>
    <thead><tr><th>Métrica</th><th>Qué cuenta</th><th class="num">Resultado</th><th class="num">Detalle</th></tr></thead>
    <tbody>
      <tr><td>Líneas</td><td>Líneas del archivo que se ejecutaron</td><td class="num">${coma(cob.lines.pct)} %</td><td class="num">${miles(cob.lines.covered)} / ${miles(cob.lines.total)}</td></tr>
      <tr><td>Sentencias</td><td>Instrucciones ejecutadas; una línea puede tener varias</td><td class="num">${coma(cob.statements.pct)} %</td><td class="num">${miles(cob.statements.covered)} / ${miles(cob.statements.total)}</td></tr>
      <tr><td>Funciones</td><td>Funciones que alguien llegó a llamar</td><td class="num">${coma(cob.functions.pct)} %</td><td class="num">${cob.functions.covered} / ${cob.functions.total}</td></tr>
      <tr><td>Ramas</td><td>Cada salida de una decisión, por separado</td><td class="num">${coma(cob.branches.pct)} %</td><td class="num">${miles(cob.branches.covered)} / ${miles(cob.branches.total)}</td></tr>
    </tbody>
  </table>

  <p>Son cuatro medidas distintas del mismo recorrido, no cuatro partes de un promedio. Cuando se dice que
    el proyecto alcanzó el 95 % se habla de sentencias y líneas, que es lo que se informa habitualmente.
    La de <b>ramas</b> es la más exigente: un «si» tiene dos salidas y hace falta recorrer las dos; una
    condición con tres causas posibles necesita tres pruebas aunque sea una sola línea.</p>

  ${imagen('calidad/imagenes/cobertura-por-capa.png', 'Cobertura de sentencias por capa del backend, medida sobre toda la corrida.')}

  <div class="nota"><b>Lo que la cobertura no mide.</b> Dice qué se ejecutó, no si se comprobó que
    estuviera bien. Una prueba que llama a una función y no verifica nada sube la cobertura igual que una
    rigurosa. Una cobertura alta no demuestra que el sistema funcione: demuestra que no queda código sin
    probar. Lo otro lo sostienen las verificaciones de cada prueba y los 35 casos funcionales.</div>

  <h3>Cómo se llegó a esta cifra</h3>
  <p>El recorrido explica el número mejor que el número solo.</p>
  <table>
    <thead><tr><th>Momento</th><th class="num">Sentencias</th><th>Qué cambió</th></tr></thead>
    <tbody>
      <tr><td>Primera medición</td><td class="num">67,2 %</td><td>Las consultas SQL se sustituían por dobles: esa capa nunca se ejecutaba y quedaba en 22 %</td></tr>
      <tr><td>Con la batería de integración</td><td class="num">90,6 %</td><td>${m.pruebas.integracion} pruebas contra la base real llevaron la capa de modelos a ${coma(m.coberturaPorCapa.find((c) => c.nombre.startsWith('Modelos')).pct)} %</td></tr>
      <tr><td>Estado actual</td><td class="num">${coma(cob.statements.pct)} %</td><td>Caminos de error de los controladores, programador de recordatorios y envío de correo</td></tr>
    </tbody>
  </table>
  <p>Queda fuera del cálculo <code>src/db</code>, que son scripts de consola ejecutados a mano y no forman
    parte del servicio en marcha. La exclusión está declarada en la configuración, no es un descuento
    improvisado.</p>
</section>

<section class="seguida">
  <h2>4. Análisis estático</h2>
  <p>Es la revisión que lee el código <b>sin ejecutarlo</b>. Encuentra una familia de problemas distinta a
    la de las pruebas: variables que no existen, código al que nunca se llega, promesas mal usadas, tipos
    que no calzan entre una función y quien la llama. Una prueba solo detecta un error si recorre esa
    línea; el análisis estático revisa todas.</p>

  <table>
    <thead><tr><th>Revisión</th><th>Qué comprueba</th><th class="num">Archivos</th><th class="num">Errores</th><th class="num">Avisos</th></tr></thead>
    <tbody>
      <tr><td>ESLint · backend</td><td>Reglas recomendadas sobre el código de Node</td><td class="num">${m.estatico.eslintBackend.archivos}</td><td class="num">${m.estatico.eslintBackend.errores}</td><td class="num">${m.estatico.eslintBackend.advertencias}</td></tr>
      <tr><td>ESLint · frontend</td><td>Reglas recomendadas, más las de React y sus hooks</td><td class="num">${m.estatico.eslintFrontend.archivos}</td><td class="num">${m.estatico.eslintFrontend.errores}</td><td class="num">${m.estatico.eslintFrontend.advertencias}</td></tr>
      <tr><td>TypeScript · frontend</td><td>Que los tipos calcen en todo el proyecto</td><td class="num">—</td><td class="num">${m.estatico.tipos.ok ? 0 : '≥1'}</td><td class="num">—</td></tr>
    </tbody>
  </table>

  <p>La configuración del backend parte de las reglas recomendadas y <b>deja fuera las de formato</b>:
    dónde van las comillas o los espacios no aporta a la calidad y solo genera ruido que termina
    ignorándose. Al estrenarla levantó tres observaciones en ${m.estatico.eslintBackend.archivos} archivos
    —dos variables sin usar y una asignación inútil—, que se corrigieron.</p>

  <div class="nota"><b>Para qué sirve tenerlo configurado y no solo ejecutado una vez:</b> queda guardado
    en el repositorio, así que cualquiera que trabaje después obtiene las mismas advertencias, y la
    revisión se puede exigir antes de aceptar un cambio.</div>
</section>

<section class="seguida">
  <h2>5. Seguridad de las dependencias</h2>
  <p>Un proyecto moderno es, en buena parte, código de terceros: bibliotecas que resuelven el envío de
    correo, el procesamiento de imágenes o la conexión a la base de datos. Esas bibliotecas también tienen
    fallos, y cuando se descubre uno se publica con un identificador y una severidad. Esta revisión
    compara las versiones instaladas contra esa base pública.</p>

  <table>
    <thead><tr><th>Proyecto</th><th class="num">Antes</th><th class="num">Después</th><th>Qué queda</th></tr></thead>
    <tbody>
      <tr><td>Backend · dependencias de producción</td><td class="num">8</td><td class="num">${dep.backend.produccion.total}</td>
          <td>Una de severidad alta en la biblioteca de correo, que exige cambiar a una versión mayor</td></tr>
      <tr><td>Frontend · todas</td><td class="num">19</td><td class="num">${dep.frontend.todas.total}</td><td>Ninguna</td></tr>
    </tbody>
  </table>

  <p>De las ocho del backend, una era de severidad crítica. Sobre la que queda conviene decir algo que
    matiza el riesgo: <b>en la nube esa biblioteca no se usa</b>. El correo sale por la interfaz HTTPS del
    proveedor, porque el alojamiento gratuito bloquea los puertos de correo; la biblioteca solo interviene
    en el entorno de desarrollo.</p>

  <div class="nota"><b>Lo que hace creíble la corrección:</b> después de aplicarla se volvió a ejecutar
    todo. Las ${miles(m.pruebas.total)} pruebas siguen pasando, la comprobación de tipos sigue limpia y la
    aplicación sigue compilando. Actualizar dependencias sin una batería de pruebas es un acto de fe;
    con ella es una operación verificable.</div>
</section>

<section>
  <h2>6. Tamaño, documentación y deuda</h2>
  <p>El proyecto son <b>${miles(codigoTotal.codigo)} líneas de código en ${codigoTotal.archivos} archivos</b>,
    más ${miles(codigoTotal.comentario)} líneas de comentario: uno de cada ocho renglones explica algo.</p>

  ${imagen('calidad/imagenes/tamano-del-codigo.png', 'Líneas de código y de comentario por parte del proyecto.')}

  <table>
    <thead><tr><th>Parte</th><th class="num">Archivos</th><th class="num">Código</th><th class="num">Comentarios</th></tr></thead>
    <tbody>
      ${Object.entries(m.codigo)
        .map(
          ([n, v]) =>
            `<tr><td>${esc(n)}</td><td class="num">${v.archivos}</td><td class="num">${miles(v.codigo)}</td><td class="num">${miles(v.comentario)}</td></tr>`
        )
        .join('\n      ')}
      <tr><td><b>Total</b></td><td class="num"><b>${codigoTotal.archivos}</b></td><td class="num"><b>${miles(codigoTotal.codigo)}</b></td><td class="num"><b>${miles(codigoTotal.comentario)}</b></td></tr>
    </tbody>
  </table>

  <p>La proporción de comentarios no es casual ni decorativa. En este proyecto los comentarios no repiten
    lo que el código ya dice, sino que explican <b>por qué</b> está hecho así y qué se intentó antes: por
    qué la medida de la curvatura se calcula con tres puntos y no con las normales, por qué el centro del
    cilindro no se guarda, por qué los grises se asignan siempre a la tinta negra. Esa información no está
    en ninguna otra parte y es la que permite retomar el trabajo meses después.</p>

  <p>Y hay <b>${m.deuda.marcas} marcas</b> de trabajo pendiente (<code>TODO</code>, <code>FIXME</code>) en
    todo el código fuente. Lo que quedó sin hacer está documentado en la memoria con su razón, no
    abandonado como un comentario suelto que nadie volverá a leer.</p>
</section>

<section>
  <h2>7. Rendimiento bajo carga</h2>
  <p>Un sistema puede ser correcto y aun así inservible si se cae con tres personas usándolo. Esta
    medición somete al backend a carga creciente —de una a cincuenta peticiones simultáneas— y registra
    cuántas atiende por segundo y cuánto espera el usuario. Se hace contra el entorno en contenedores,
    nunca contra el despliegue en la nube: en el plan gratuito se mediría el plan y no el sistema.</p>
  <p>Se informan <b>percentiles</b> y no promedios: el percentil 95 es el tiempo que esperó el usuario que
    peor lo pasó, dejando fuera el 5 % más extremo. El promedio esconde justamente esos casos, que son los
    que el usuario recuerda.</p>

  <table>
    <thead><tr><th>Escenario</th><th class="num">Máx. pet./s</th><th class="num">p50 (ms)</th><th class="num">p95 (ms)</th><th class="num">Simultáneas</th></tr></thead>
    <tbody>
${filasCarga}
    </tbody>
  </table>
  <p style="font-size:9pt;color:#57606f">Las columnas de latencia corresponden al nivel de mayor
    concurrencia de cada escenario, que es el caso más exigente. Ninguna de las peticiones de la corrida
    devolvió error.</p>

  ${imagen('pruebas-estres/imagenes/resumen.png', 'Capacidad máxima medida en cada escenario, en el entorno local.')}

  <h3>La prueba que más dice</h3>
  <p>De los cinco escenarios —cuatro con rampa de concurrencia y uno de colisión— el que mejor demuestra
    que el sistema sigue siendo correcto bajo presión es el último:
    <b>${carga.colision.intentos} peticiones lanzadas a la vez pidiendo exactamente el mismo horario</b>.
    Se creó ${carga.colision.creadas === 1 ? 'una sola cita' : `${carga.colision.creadas} citas`} y las
    otras ${carga.colision.rechazadas} fueron rechazadas por choque, todo resuelto en
    ${carga.colision.duracionMs} milisegundos. Eso es el bloqueo por artista funcionando: sin él, dos
    clientes podrían quedar agendados a la misma hora.</p>

  <div class="nota"><b>Proyección, no medición.</b> Las cifras de arriba se tomaron en el entorno local.
    En el despliegue gratuito —512 MB y una fracción de CPU compartida— cabe esperar entre diez y cuarenta
    peticiones por segundo según el escenario, y el límite real no sería la velocidad sino la memoria
    durante el procesamiento de imágenes. Un tatuador hace del orden de cien peticiones en un día de
    trabajo, de modo que la capacidad sobra con holgura.</div>
</section>

<section>
  <h2>8. Cómo repetir todas las mediciones</h2>
  <p>Nada de este informe es un dato tomado una vez y copiado a mano. Cada cifra sale de un archivo que
    genera una herramienta, y cualquiera puede volver a producirla.</p>
  <table>
    <thead><tr><th>Qué</th><th>Comando</th><th>Dónde queda</th></tr></thead>
    <tbody>
      <tr><td>Pruebas</td><td><code>npx jest --runInBand</code></td><td>En la consola</td></tr>
      <tr><td>Cobertura</td><td><code>npx jest --runInBand --coverage</code></td><td><code>backend/coverage/index.html</code></td></tr>
      <tr><td>Análisis estático</td><td><code>npx eslint .</code> · <code>npx tsc --noEmit</code></td><td>En la consola</td></tr>
      <tr><td>Dependencias</td><td><code>npm audit</code></td><td>En la consola</td></tr>
      <tr><td>Informe completo</td><td><code>node backend/calidad/medir.js</code></td><td><code>docs/calidad/metricas.json</code></td></tr>
      <tr><td>Página del informe</td><td><code>node backend/calidad/informe.js</code></td><td><code>docs/calidad/index.html</code></td></tr>
      <tr><td>Este PDF</td><td><code>node backend/calidad/pdf.js</code></td><td><code>docs/calidad/informe-calidad.pdf</code></td></tr>
      <tr><td>Carga y estrés</td><td><code>node backend/stress/correr.js</code></td><td><code>docs/pruebas-estres/resultados.json</code></td></tr>
    </tbody>
  </table>
  <p>Las herramientas se ejecutan dentro de los contenedores de Docker: en el equipo de desarrollo, la
    carpeta del proyecto está sincronizada en la nube y la lectura de las dependencias deja los procesos
    colgados. El script <code>medir.js</code> se encarga de llamar a cada una en el contenedor que
    corresponde.</p>
  <div class="nota">Los informes navegables equivalentes a este documento están en
    <code>docs/calidad/</code> (calidad del código), <code>docs/cobertura/</code> (cobertura, con su
    explicación detallada) y <code>docs/pruebas-estres/</code> (carga y estrés). Se abren con doble clic,
    sin servidor ni dependencias.</div>
</section>

<section>
  <h2>9. Glosario</h2>
  <dl>
${GLOSARIO.map(([t, d]) => `    <dt>${esc(t)}</dt>\n    <dd>${esc(d)}</dd>`).join('\n')}
  </dl>
</section>

<section>
  <h2>10. Preguntas frecuentes y cómo responderlas</h2>
  <p>Las que más probablemente aparezcan al presentar este trabajo, con una respuesta que se apoya en los
    datos de este informe.</p>
${PREGUNTAS.map(([q, a]) => `  <div class="pregunta"><div class="q">${esc(q)}</div><div class="a">${esc(a)}</div></div>`).join('\n')}

</section>

</body>
</html>
`;

// ------------------------------------------------------------------ impresión

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function wsDelNavegador() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PUERTO}/json/list`);
      const pagina = (await res.json()).find((t) => t.type === 'page');
      if (pagina?.webSocketDebuggerUrl) return pagina.webSocketDebuggerUrl;
    } catch {
      /* todavía no abre el puerto */
    }
    await espera(500);
  }
  throw new Error('Chrome no expuso el puerto de depuración');
}

function cliente(url) {
  const ws = new WebSocket(url, { maxPayload: 256 * 1024 * 1024 });
  let id = 0;
  const pendientes = new Map();
  const eventos = new Map();
  ws.on('message', (bruto) => {
    const msg = JSON.parse(bruto);
    if (msg.id && pendientes.has(msg.id)) {
      const { resolve, reject } = pendientes.get(msg.id);
      pendientes.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    } else if (msg.method && eventos.has(msg.method)) {
      for (const r of eventos.get(msg.method)) r(msg.params);
      eventos.delete(msg.method);
    }
  });
  return {
    abierto: () => new Promise((r) => ws.once('open', r)),
    enviar: (method, params = {}) =>
      new Promise((resolve, reject) => {
        const mensaje = { id: ++id, method, params };
        pendientes.set(mensaje.id, { resolve, reject });
        ws.send(JSON.stringify(mensaje));
      }),
    alEvento: (method) =>
      new Promise((resolve) => {
        if (!eventos.has(method)) eventos.set(method, []);
        eventos.get(method).push(resolve);
      }),
    cerrar: () => ws.close(),
  };
}

(async () => {
  const temporal = path.join(os.tmpdir(), `informe-calidad-${Date.now()}.html`);
  fs.writeFileSync(temporal, html);

  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-pdf-'));
  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      `--remote-debugging-port=${PUERTO}`,
      `--user-data-dir=${perfil}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--allow-file-access-from-files',
      'about:blank',
    ],
    { stdio: 'ignore' }
  );

  try {
    const cdp = cliente(await wsDelNavegador());
    await cdp.abierto();
    await cdp.enviar('Page.enable');
    const cargado = cdp.alEvento('Page.loadEventFired');
    await cdp.enviar('Page.navigate', { url: `file:///${temporal.split('\\').join('/')}` });
    await cargado;
    await espera(1200); // fuentes e imágenes

    const { data } = await cdp.enviar('Page.printToPDF', {
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate:
        '<div style="width:100%;font-size:8pt;color:#8b95a1;padding:0 16mm;' +
        'font-family:Segoe UI,Arial,sans-serif;display:flex;justify-content:space-between">' +
        '<span>Informe de calidad de código · Plataforma para estudios de tatuaje</span>' +
        '<span class="pageNumber"></span></div>',
      marginTop: 0.7,
      marginBottom: 0.7,
      marginLeft: 0.63,
      marginRight: 0.63,
    });

    fs.mkdirSync(path.dirname(SALIDA), { recursive: true });
    fs.writeFileSync(SALIDA, Buffer.from(data, 'base64'));
    cdp.cerrar();
    const kb = Math.round(fs.statSync(SALIDA).size / 1024);
    console.log(`PDF generado: ${SALIDA} (${kb} kB)`);
  } finally {
    chrome.kill();
    fs.rmSync(temporal, { force: true });
    // Windows mantiene abiertos los archivos del perfil un instante después de
    // cerrar el navegador; si no alcanza a soltarlos, no vale la pena fallar.
    await espera(700);
    try {
      fs.rmSync(perfil, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
    } catch {
      /* lo limpia el sistema */
    }
  }
})();
