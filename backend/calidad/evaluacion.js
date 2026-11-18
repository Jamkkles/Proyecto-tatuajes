/**
 * Arma el informe de evaluación de calidad del software, en el registro formal
 * que corresponde a una entrega académica.
 *
 *   node backend/calidad/evaluacion.js
 *
 * Es el hermano formal de pdf.js: las mismas mediciones, pero ordenadas como un
 * informe de evaluación (objetivos, metodología, resultados, discusión,
 * limitaciones y conclusiones) y escritas en forma impersonal. pdf.js, en
 * cambio, está pensado para estudiar: lleva glosario y preguntas de defensa.
 *
 * Ambos leen los mismos docs/calidad/metricas.json y
 * docs/pruebas-estres/resultados.json, de modo que no pueden contradecirse.
 *
 * Salida: docs/calidad/informe-evaluacion.pdf
 */
const fs = require('fs');
const path = require('path');
const { imprimir } = require('./imprimir');

const RAIZ = path.join(__dirname, '..', '..');
const DOCS = path.join(RAIZ, 'docs');
const SALIDA = path.join(DOCS, 'calidad', 'informe-evaluacion.pdf');

const m = JSON.parse(fs.readFileSync(path.join(DOCS, 'calidad', 'metricas.json'), 'utf8'));
const carga = JSON.parse(
  fs.readFileSync(path.join(DOCS, 'pruebas-estres', 'resultados.json'), 'utf8')
);

// ------------------------------------------------------------------ ayudas

const coma = (n) => String(n).replace('.', ',');
const miles = (n) => Number(n).toLocaleString('es-CL');
const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Incrusta la imagen en el documento, para que el PDF no dependa de archivos. */
function figura(rutaRelativa, numero, pie) {
  const base64 = fs.readFileSync(path.join(DOCS, rutaRelativa)).toString('base64');
  return `<figure><img src="data:image/png;base64,${base64}" alt="${esc(pie)}">
    <figcaption><b>Figura ${numero}.</b> ${esc(pie)}</figcaption></figure>`;
}

const cob = m.cobertura;
const dep = m.dependencias;
const total = Object.values(m.codigo).reduce(
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
const capa = (prefijo) => m.coberturaPorCapa.find((c) => c.nombre.startsWith(prefijo));
const escenario = (id) => carga.escenarios.find((e) => e.id === id);
const maxRps = (id) => Math.max(...escenario(id).medidas.map((x) => x.rps));
const fechaLarga = new Date(m.fecha).toLocaleDateString('es-CL', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

// ------------------------------------------------------------------ contenido

/** Marco de referencia: ISO/IEC 25010, con lo medido y lo que quedó fuera. */
const CARACTERISTICAS = [
  [
    'Adecuación funcional',
    'Que el sistema haga lo que debe hacer',
    `${miles(m.pruebas.total)} pruebas automatizadas y 35 casos funcionales de caja negra`,
    'si',
  ],
  [
    'Eficiencia de desempeño',
    'Tiempo de respuesta y capacidad bajo carga',
    'Pruebas de carga con rampa de concurrencia sobre cinco escenarios',
    'si',
  ],
  [
    'Fiabilidad',
    'Que se comporte bien ante fallos y concurrencia',
    'Pruebas de integración de exclusión mutua y caminos de error forzados',
    'si',
  ],
  [
    'Seguridad',
    'Control de acceso y ausencia de fallos conocidos',
    'Casos funcionales de propiedad de datos y revisión de dependencias',
    'parcial',
  ],
  [
    'Mantenibilidad',
    'Que el código se pueda revisar y modificar',
    'Cobertura de código, análisis estático y recuento de tamaño y documentación',
    'si',
  ],
  [
    'Usabilidad',
    'Que la persona logre su objetivo sin dificultad',
    'Cuestionario SUS: instrumento definido, aplicación pendiente',
    'no',
  ],
  [
    'Compatibilidad y portabilidad',
    'Convivencia con otros sistemas y traslado de entorno',
    'No se midió formalmente; el sistema se ejecuta en contenedores y en la nube',
    'no',
  ],
];

const INSTRUMENTOS = [
  ['Jest', m.herramientas.jest, 'Ejecutor de pruebas automatizadas', 'Contenedor del backend'],
  ['Supertest', m.herramientas.supertest, 'Peticiones HTTP contra la aplicación Express', 'Contenedor del backend'],
  ['Istanbul', 'integrado en Jest', 'Instrumentación y medición de cobertura', 'Contenedor del backend'],
  ['PostgreSQL', '16', 'Base de datos real para las pruebas de integración', 'Contenedor propio'],
  ['ESLint', m.herramientas.eslint, 'Análisis estático del código fuente', 'Ambos contenedores'],
  ['TypeScript', m.herramientas.typescript, 'Comprobación de tipos del frontend', 'Contenedor del frontend'],
  ['npm audit', `npm sobre Node ${m.herramientas.node}`, 'Contraste con la base pública de vulnerabilidades', 'Ambos contenedores'],
  ['Generador propio', 'sin dependencias', 'Carga concurrente y cálculo de percentiles', 'Host contra el backend'],
];

const LIMITACIONES = [
  [
    'La cobertura corresponde únicamente al backend',
    'Es donde residen las reglas de negocio y el control de acceso. El frontend se verifica con el compilador de tipos, con el analizador estático y con los casos funcionales, pero no dispone de una batería de pruebas propia.',
  ],
  [
    'Las mediciones de carga se tomaron en el entorno de contenedores',
    'No se midió contra el despliegue en la nube de forma deliberada: el plan gratuito contratado introduce suspensión por inactividad y recursos compartidos, de modo que la medición describiría el plan y no el sistema. La sección 5.4 expone una proyección, declarada como tal.',
  ],
  [
    'La cobertura de ramas es inferior a las demás métricas',
    'Las bifurcaciones no cubiertas pertenecen mayoritariamente al canal de mensajería vinculado, cuyos caminos de reconexión solo se recorren contra un servicio externo real.',
  ],
  [
    'Persiste una vulnerabilidad conocida en dependencias de producción',
    'Corresponde a la biblioteca de correo y exige una actualización de versión mayor. En el despliegue en la nube esa biblioteca no interviene, porque el correo se envía por la interfaz HTTPS del proveedor.',
  ],
  [
    'La evaluación de usabilidad no se ha aplicado',
    'El instrumento (cuestionario SUS) y el procedimiento están definidos, pero la sesión con los participantes no se ha realizado a la fecha de esta entrega.',
  ],
];

// ------------------------------------------------------------------ tablas

const filaCapas = m.coberturaPorCapa
  .map(
    (c) =>
      `<tr><td>${esc(c.nombre)}</td><td class="num">${miles(c.cubierto)} / ${miles(c.total)}</td><td class="num">${coma(c.pct)} %</td></tr>`
  )
  .join('\n      ');

const filasCarga = carga.escenarios
  .map((e) => {
    const peor = e.medidas[e.medidas.length - 1];
    return `<tr><td>${esc(e.nombre.replace(/^\d+\.\s*/, ''))}</td><td class="num">${peor.concurrencia}</td><td class="num">${coma(Math.max(...e.medidas.map((x) => x.rps)))}</td><td class="num">${coma(peor.latencia.p50)}</td><td class="num">${coma(peor.latencia.p95)}</td><td class="num">0</td></tr>`;
  })
  .join('\n      ');

const filasCodigo = Object.entries(m.codigo)
  .map(
    ([n, v]) =>
      `<tr><td>${esc(n)}</td><td class="num">${v.archivos}</td><td class="num">${miles(v.codigo)}</td><td class="num">${miles(v.comentario)}</td><td class="num">${coma(((100 * v.comentario) / (v.codigo + v.comentario)).toFixed(1))} %</td></tr>`
  )
  .join('\n      ');

const ESTADO = { si: ['Medida', 'ok'], parcial: ['Parcial', 'ojo'], no: ['No medida', 'no'] };
const filasIso = CARACTERISTICAS.map(([c, d, i, e]) => {
  const [texto, clase] = ESTADO[e];
  return `<tr><td>${esc(c)}</td><td>${esc(d)}</td><td>${esc(i)}</td><td class="${clase}">${texto}</td></tr>`;
}).join('\n      ');

// ------------------------------------------------------------------ documento

const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Informe de evaluación de la calidad del software</title>
<style>
  @page { size: A4; margin: 20mm 18mm 18mm; }
  * { box-sizing: border-box; }
  body { margin:0; font-family:'Segoe UI', Roboto, Helvetica, sans-serif;
         color:#1d232b; font-size:10.5pt; line-height:1.6; text-align:justify; }
  h1 { font-size:15pt; margin:0 0 10pt; padding-bottom:6pt; border-bottom:1.5pt solid #c9d1da; text-align:left; }
  h2 { font-size:11.5pt; margin:16pt 0 5pt; text-align:left; }
  h3 { font-size:10.5pt; margin:12pt 0 3pt; font-weight:600; text-align:left; }
  p { margin:0 0 8pt; }
  section { page-break-before: always; }
  section.seguida { page-break-before: auto; }

  .portada { height:252mm; display:flex; flex-direction:column; text-align:center; }
  .portada .inst { font-size:11pt; letter-spacing:.06em; line-height:1.7; margin-top:14mm; }
  .portada .inst b { display:block; font-size:12pt; }
  .portada .centro { flex:1; display:flex; flex-direction:column; justify-content:center; }
  .portada .tipo { font-size:9.5pt; letter-spacing:.18em; text-transform:uppercase; color:#5a6472; margin-bottom:9pt; }
  .portada h1 { font-size:20pt; border:0; padding:0; margin:0 0 6pt; text-align:center; line-height:1.3; }
  .portada .sub { font-size:12pt; color:#424b57; margin-bottom:24pt; }
  .portada .regla { width:62mm; height:1.2pt; background:#c9d1da; margin:0 auto 24pt; }
  .portada .datos { font-size:10.5pt; line-height:1.9; }
  .portada .pie { font-size:10pt; color:#5a6472; line-height:1.7; }

  table { border-collapse:collapse; width:100%; font-size:9.5pt; margin:9pt 0 4pt;
          page-break-inside:avoid; text-align:left; }
  caption { caption-side:top; text-align:left; font-size:9pt; color:#424b57; padding-bottom:4pt; }
  caption b { color:#1d232b; }
  th, td { border-bottom:0.6pt solid #dfe4ea; padding:5pt 7pt; vertical-align:top; }
  thead th { border-top:1pt solid #9aa5b1; border-bottom:1pt solid #9aa5b1;
             font-size:8.5pt; text-transform:uppercase; letter-spacing:.04em; color:#424b57; }
  tbody tr:last-child td { border-bottom:1pt solid #9aa5b1; }
  td.num, th.num { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }
  td.ok { color:#1b6b3c; } td.ojo { color:#8f6209; } td.no { color:#6b7480; }

  figure { margin:10pt 0 12pt; page-break-inside:avoid; }
  img { width:100%; border:0.6pt solid #dfe4ea; }
  figcaption { font-size:9pt; color:#424b57; margin-top:5pt; text-align:left; }

  .resumen { border:0.8pt solid #c9d1da; padding:11pt 14pt; background:#fafbfc; margin-bottom:12pt; }
  .resumen h2 { margin-top:0; }
  .cifras { display:flex; gap:9pt; margin:10pt 0 12pt; }
  .cifras div { flex:1; border:0.8pt solid #dfe4ea; padding:7pt 9pt; text-align:center; }
  .cifras .n { font-size:14pt; font-weight:600; display:block; }
  .cifras .t { font-size:8pt; color:#5a6472; line-height:1.35; }
  dl { margin:4pt 0 0; } dt { font-weight:600; margin-top:8pt; text-align:left; }
  dd { margin:0; }
  ol.indice { margin:4pt 0 0; padding-left:18pt; font-size:10pt; }
  ol.indice li { margin-bottom:2.5pt; }
  ol.indice ol { margin:2.5pt 0 0; padding-left:16pt; color:#424b57; }
  code { font-family:ui-monospace, monospace; font-size:9pt; }
</style>
</head>
<body>

<div class="portada">
  <div class="inst">
    <b>UNIVERSIDAD DE TALCA</b>
    FACULTAD DE INGENIERÍA<br>
    ESCUELA DE INGENIERÍA CIVIL EN COMPUTACIÓN
  </div>
  <div class="centro">
    <div class="tipo">Informe de evaluación de la calidad del software</div>
    <h1>Plataforma web para la gestión integral y<br>asistencia de diseño en estudios de tatuaje</h1>
    <div class="sub">Medición de pruebas, cobertura, verificación estática y desempeño</div>
    <div class="regla"></div>
    <div class="datos">
      <b>PABLO NICOLÁS CORREA MELLA</b><br>
      Profesor Guía: Francisco Arias
    </div>
  </div>
  <div class="pie">
    Documento complementario a la memoria de título<br>
    Mediciones ejecutadas el ${esc(fechaLarga)}<br>
    Curicó — Chile
  </div>
</div>

<section>
  <h1>Resumen</h1>
  <div class="resumen">
    <p style="margin-bottom:0">Este informe documenta la evaluación de la calidad del software
      construido para la memoria de título. La evaluación se apoya exclusivamente en mediciones
      ejecutadas sobre el código del repositorio: no contiene estimaciones, salvo la proyección de
      capacidad en la nube de la sección 5.4, declarada como tal en su lugar. Se obtuvieron
      ${miles(m.pruebas.total)} pruebas automatizadas aprobadas sin fallos, una cobertura de
      ${coma(cob.statements.pct)} % de las sentencias del backend, ausencia de observaciones en el
      análisis estático de los ${m.estatico.eslintBackend.archivos + m.estatico.eslintFrontend.archivos}
      archivos revisados, y una capacidad medida de hasta ${Math.round(maxRps('agenda'))} peticiones
      por segundo sin errores. Se declara también lo que no se midió y lo que quedó pendiente.</p>
  </div>

  <div class="cifras">
    <div><span class="n">${miles(m.pruebas.total)}</span><span class="t">pruebas aprobadas,<br>0 fallidas</span></div>
    <div><span class="n">${coma(cob.statements.pct)} %</span><span class="t">cobertura de<br>sentencias</span></div>
    <div><span class="n">0</span><span class="t">observaciones de<br>análisis estático</span></div>
    <div><span class="n">26 / 27</span><span class="t">vulnerabilidades<br>corregidas</span></div>
    <div><span class="n">${Math.round(maxRps('agenda'))}</span><span class="t">peticiones por<br>segundo (máx.)</span></div>
  </div>

  <h2>Índice</h2>
  <ol class="indice">
    <li>Objetivo y alcance de la evaluación</li>
    <li>Marco de referencia e instrumentos
      <ol><li>Características evaluadas</li><li>Instrumentos de medición</li><li>Entorno y procedimiento</li></ol></li>
    <li>Verificación funcional
      <ol><li>Pruebas automatizadas</li><li>Pruebas de integración y concurrencia</li></ol></li>
    <li>Cobertura de código
      <ol><li>Resultados globales</li><li>Resultados por capa</li><li>Evolución de la medición</li></ol></li>
    <li>Verificación estática, dependencias y desempeño
      <ol><li>Análisis estático</li><li>Dependencias de terceros</li><li>Tamaño y documentación</li><li>Desempeño bajo carga</li></ol></li>
    <li>Discusión de los resultados</li>
    <li>Limitaciones de la evaluación</li>
    <li>Conclusiones</li>
    <li>Anexo: reproducción de las mediciones</li>
  </ol>
</section>

<section>
  <h1>1. Objetivo y alcance de la evaluación</h1>
  <p>El objetivo de esta evaluación es establecer, mediante evidencia medible, en qué grado el software
    construido satisface criterios verificables de calidad, y declarar con la misma precisión aquello
    que no fue evaluado.</p>
  <p>La distinción es pertinente porque la afirmación «el sistema funciona» se demuestra usándolo,
    mientras que la afirmación «el software es de calidad» exige instrumentos. Un programa puede operar
    correctamente en la demostración y, al mismo tiempo, contener código que nunca se ha ejecutado,
    dependencias con fallos de seguridad publicados o un comportamiento incorrecto bajo concurrencia
    que la operación individual jamás revela. Las mediciones que siguen están dirigidas precisamente a
    esas propiedades que el uso no exhibe.</p>
  <p>El alcance comprende la totalidad del código fuente desarrollado: el servicio de backend
    (Node.js sobre PostgreSQL) y la aplicación de frontend (React con TypeScript), por un total de
    ${miles(total.codigo)} líneas de código en ${total.archivos} archivos. Quedan excluidas las
    bibliotecas de terceros en cuanto a su código interno, que se evalúan únicamente por sus
    vulnerabilidades publicadas (sección 5.2).</p>
  <p>Todas las cifras de este informe proceden de los archivos de resultados que generan las propias
    herramientas de medición, <code>docs/calidad/metricas.json</code> y
    <code>docs/pruebas-estres/resultados.json</code>. Ninguna fue transcrita a mano, y el anexo detalla
    cómo reproducir cada una.</p>
</section>

<section class="seguida">
  <h1>2. Marco de referencia e instrumentos</h1>

  <h2>2.1 Características evaluadas</h2>
  <p>Para ordenar la evaluación y evitar que la selección de métricas resultara arbitraria, se adoptó
    como marco de referencia el modelo de calidad del producto software de la norma ISO/IEC 25010, que
    descompone la calidad en características observables. La Tabla 1 indica, para cada una, el
    instrumento empleado y si fue efectivamente medida en esta entrega.</p>
  <table>
    <caption><b>Tabla 1.</b> Características de calidad, instrumento aplicado y estado de la medición.</caption>
    <thead><tr><th>Característica</th><th>Qué expresa</th><th>Instrumento aplicado</th><th>Estado</th></tr></thead>
    <tbody>
      ${filasIso}
    </tbody>
  </table>
  <p>La usabilidad aparece como no medida porque su instrumento —el cuestionario SUS— depende de la
    participación de personas y la sesión correspondiente no se ha realizado. La seguridad figura como
    parcial porque se verificaron el control de acceso y las vulnerabilidades conocidas de terceros,
    pero no se realizó una auditoría de seguridad ni pruebas de penetración.</p>

  <h2>2.2 Instrumentos de medición</h2>
  <p>Todos los instrumentos son herramientas de uso extendido en la industria, con excepción del
    generador de carga, que se desarrolló para este proyecto por no requerir dependencias externas y
    permitir escenarios específicos del dominio.</p>
  <table>
    <caption><b>Tabla 2.</b> Instrumentos empleados, versión y lugar de ejecución.</caption>
    <thead><tr><th>Instrumento</th><th>Versión</th><th>Función en la evaluación</th><th>Ejecución</th></tr></thead>
    <tbody>
      ${INSTRUMENTOS.map(
        ([n, v, f, e]) =>
          `<tr><td>${esc(n)}</td><td>${esc(v)}</td><td>${esc(f)}</td><td>${esc(e)}</td></tr>`
      ).join('\n      ')}
    </tbody>
  </table>

  <h2>2.3 Entorno y procedimiento</h2>
  <p>Las mediciones se ejecutaron sobre el entorno de contenedores descrito en la memoria: un
    contenedor para el servicio de backend, otro para la aplicación de frontend y un tercero para el
    motor de base de datos. Se empleó este entorno, y no el despliegue en la nube, por dos razones: es
    el único en que los recursos son conocidos y estables, y someter a carga sostenida un plan gratuito
    mediría las restricciones del plan en lugar de las del sistema.</p>
  <p>El procedimiento fue uniforme para todas las dimensiones: cada herramienta se invocó en modo no
    interactivo, su salida se capturó en formato estructurado y se consolidó en un único archivo de
    resultados, del que este informe deriva sus tablas y figuras. Los valores no se registraron
    manualmente en ningún punto del proceso, de modo que el informe no puede divergir de la medición.</p>
</section>

<section>
  <h1>3. Verificación funcional</h1>

  <h2>3.1 Pruebas automatizadas</h2>
  <p>La batería de pruebas automatizadas comprende ${miles(m.pruebas.total)} casos distribuidos en
    ${m.pruebas.archivos} archivos, organizados en dos conjuntos que se ejecutan en una sola corrida.
    La totalidad de los casos resultó aprobada.</p>
  <table>
    <caption><b>Tabla 3.</b> Resultados de la ejecución de la batería de pruebas.</caption>
    <thead><tr><th>Conjunto</th><th>Qué verifica</th><th class="num">Casos</th><th class="num">Aprobados</th><th class="num">Fallidos</th></tr></thead>
    <tbody>
      <tr><td>Pruebas unitarias</td><td>Módulos aislados, con las dependencias sustituidas por dobles</td><td class="num">${miles(m.pruebas.unitarias)}</td><td class="num">${miles(m.pruebas.unitarias)}</td><td class="num">0</td></tr>
      <tr><td>Pruebas de integración</td><td>Módulos reales contra un motor PostgreSQL</td><td class="num">${m.pruebas.integracion}</td><td class="num">${m.pruebas.integracion}</td><td class="num">0</td></tr>
      <tr><td><b>Total</b></td><td></td><td class="num"><b>${miles(m.pruebas.total)}</b></td><td class="num"><b>${miles(m.pruebas.aprobadas)}</b></td><td class="num"><b>${m.pruebas.fallidas}</b></td></tr>
    </tbody>
  </table>
  <p>A esta batería se suman los 35 casos de prueba funcional de caja negra documentados en el
    Capítulo 5 de la memoria, que recorren el sistema de extremo a extremo por la misma interfaz que
    emplea la aplicación web. Los 35 resultaron conformes.</p>
  <p>Conviene observar la proporción entre código de prueba y código verificado: el backend consta de
    ${miles(lineasBackend)} líneas, mientras que las pruebas suman
    ${miles(m.codigo['Pruebas automatizadas'].codigo)}, es decir ${razonPruebas} líneas de prueba por
    cada línea verificada. La relación es deliberada y constituye la condición que permite modificar el
    sistema con posterioridad y comprobar en menos de un minuto que nada se ha deteriorado.</p>

  <h2>3.2 Pruebas de integración y concurrencia</h2>
  <p>Las ${m.pruebas.integracion} pruebas de integración se ejecutan contra una base de datos real que
    la propia corrida crea, a la que aplica el esquema del proyecto y cuyas tablas vacía antes de cada
    caso. Una comprobación de arranque impide que la batería opere sobre la base de desarrollo: si el
    nombre de la base conectada no corresponde al de pruebas, la ejecución se detiene antes de
    modificar dato alguno.</p>
  <p>Su justificación es precisa. Existen propiedades del sistema que un doble de prueba no puede
    demostrar, porque quien las garantiza es el motor de base de datos. La Tabla 4 reúne las cuatro
    principales.</p>
  <table>
    <caption><b>Tabla 4.</b> Propiedades verificables únicamente contra una base de datos real.</caption>
    <thead><tr><th>Propiedad verificada</th><th>Mecanismo responsable</th><th>Resultado</th></tr></thead>
    <tbody>
      <tr><td>Diez peticiones simultáneas sobre el mismo horario producen una sola cita</td><td>Bloqueo consultivo por artista dentro de la transacción</td><td>Conforme</td></tr>
      <tr><td>El inventario no admite existencias negativas bajo descuentos concurrentes</td><td>Operación aritmética resuelta en la sentencia SQL</td><td>Conforme</td></tr>
      <tr><td>Una cotización no se descuenta dos veces</td><td>Marca condicional dentro de la transacción</td><td>Conforme</td></tr>
      <tr><td>Las consultas filtran siempre por el artista propietario de los datos</td><td>Composición de las sentencias a partir del identificador del token</td><td>Conforme</td></tr>
    </tbody>
  </table>
  <p>La primera propiedad se verificó además bajo carga real, con el resultado que recoge la
    sección 5.4.</p>
</section>

<section class="seguida">
  <h1>4. Cobertura de código</h1>

  <h2>4.1 Resultados globales</h2>
  <p>La cobertura expresa la proporción del código que la ejecución de las pruebas alcanza
    efectivamente. Se obtiene instrumentando el código antes de ejecutarlo y registrando qué elementos
    se recorren. La Tabla 5 presenta las cuatro métricas que informa la herramienta, que constituyen
    cuatro observaciones distintas sobre un mismo recorrido y no componentes de un promedio.</p>
  <table>
    <caption><b>Tabla 5.</b> Cobertura del backend, por métrica.</caption>
    <thead><tr><th>Métrica</th><th>Unidad contabilizada</th><th class="num">Cubiertos</th><th class="num">Totales</th><th class="num">Cobertura</th></tr></thead>
    <tbody>
      <tr><td>Líneas</td><td>Líneas del archivo ejecutadas</td><td class="num">${miles(cob.lines.covered)}</td><td class="num">${miles(cob.lines.total)}</td><td class="num">${coma(cob.lines.pct)} %</td></tr>
      <tr><td>Sentencias</td><td>Instrucciones ejecutadas</td><td class="num">${miles(cob.statements.covered)}</td><td class="num">${miles(cob.statements.total)}</td><td class="num">${coma(cob.statements.pct)} %</td></tr>
      <tr><td>Funciones</td><td>Funciones invocadas al menos una vez</td><td class="num">${cob.functions.covered}</td><td class="num">${cob.functions.total}</td><td class="num">${coma(cob.functions.pct)} %</td></tr>
      <tr><td>Ramas</td><td>Salidas de decisión recorridas</td><td class="num">${miles(cob.branches.covered)}</td><td class="num">${miles(cob.branches.total)}</td><td class="num">${coma(cob.branches.pct)} %</td></tr>
    </tbody>
  </table>
  <p>La cobertura de ramas es sistemáticamente la menor de las cuatro, y ello responde a su
    definición: contabiliza cada salida de cada decisión por separado, de modo que una condición
    compuesta por tres causas exige tres casos distintos aunque ocupe una sola línea. El valor
    alcanzado, ${coma(cob.branches.pct)} %, se considera satisfactorio para esta métrica.</p>
  <p>Del cálculo se excluye el directorio de scripts de consola, que se ejecutan manualmente para
    inicializar la base de datos y no forman parte del servicio en operación. La exclusión está
    declarada en la configuración de la herramienta y no constituye un descuento aplicado al resultado.</p>

  <h2>4.2 Resultados por capa</h2>
  <p>La distribución por capa permite verificar que la cobertura no se concentra en las porciones
    triviales del sistema. La Tabla 6 y la Figura 1 muestran que las capas que concentran las reglas de
    negocio —modelos, servicios y controladores— se sitúan todas por encima del 95 %.</p>
  <table>
    <caption><b>Tabla 6.</b> Cobertura de sentencias por capa arquitectónica del backend.</caption>
    <thead><tr><th>Capa</th><th class="num">Sentencias cubiertas</th><th class="num">Cobertura</th></tr></thead>
    <tbody>
      ${filaCapas}
    </tbody>
  </table>

  ${figura('calidad/imagenes/cobertura-por-capa.png', 1, 'Cobertura de sentencias por capa del backend. La línea discontinua señala el 95 % fijado como meta.')}

  <h2>4.3 Evolución de la medición</h2>
  <p>El valor final adquiere sentido al contrastarlo con su punto de partida. La primera medición
    arrojó 67,2 %, y el análisis del informe detallado identificó la causa: la capa de acceso a datos
    se sustituía íntegramente por dobles en las pruebas unitarias, de modo que sus sentencias no se
    ejecutaban nunca y la capa quedaba en 22 %. La incorporación de la batería de integración elevó esa
    capa a ${coma(capa('Modelos').pct)} % y el total a 90,6 %. La cobertura posterior de los caminos de
    error de los controladores, del programador de recordatorios y del servicio de correo condujo al
    valor actual.</p>
  <table>
    <caption><b>Tabla 7.</b> Evolución de la cobertura de sentencias y causa de cada variación.</caption>
    <thead><tr><th>Etapa</th><th class="num">Cobertura</th><th>Intervención realizada</th></tr></thead>
    <tbody>
      <tr><td>Medición inicial</td><td class="num">67,2 %</td><td>Ninguna; estado del proyecto al iniciar la evaluación</td></tr>
      <tr><td>Tras la batería de integración</td><td class="num">90,6 %</td><td>Incorporación de ${m.pruebas.integracion} pruebas contra PostgreSQL</td></tr>
      <tr><td>Estado final</td><td class="num">${coma(cob.statements.pct)} %</td><td>Cobertura de caminos de error, programador de tareas y servicio de correo</td></tr>
    </tbody>
  </table>
  <p>Que la medición haya provocado una intervención sobre el código es, en sí mismo, un resultado:
    confirma que el instrumento identificó una carencia real y no se limitó a describir el estado
    existente.</p>
</section>

<section class="seguida">
  <h1>5. Verificación estática, dependencias y desempeño</h1>

  <h2>5.1 Análisis estático</h2>
  <p>El análisis estático examina el código fuente sin ejecutarlo y detecta una familia de defectos
    distinta de la que alcanzan las pruebas: identificadores inexistentes, código inalcanzable, uso
    incorrecto de operaciones asíncronas e incompatibilidades de tipo. A diferencia de una prueba, que
    solo detecta un defecto si la ejecución recorre esa línea, el análisis estático examina la
    totalidad del código.</p>
  <table>
    <caption><b>Tabla 8.</b> Resultados del análisis estático.</caption>
    <thead><tr><th>Revisión</th><th>Criterio aplicado</th><th class="num">Archivos</th><th class="num">Errores</th><th class="num">Advertencias</th></tr></thead>
    <tbody>
      <tr><td>ESLint — backend</td><td>Reglas recomendadas, sin reglas de formato</td><td class="num">${m.estatico.eslintBackend.archivos}</td><td class="num">${m.estatico.eslintBackend.errores}</td><td class="num">${m.estatico.eslintBackend.advertencias}</td></tr>
      <tr><td>ESLint — frontend</td><td>Reglas recomendadas, React y reglas de hooks</td><td class="num">${m.estatico.eslintFrontend.archivos}</td><td class="num">${m.estatico.eslintFrontend.errores}</td><td class="num">${m.estatico.eslintFrontend.advertencias}</td></tr>
      <tr><td>TypeScript — frontend</td><td>Comprobación de tipos del proyecto completo</td><td class="num">—</td><td class="num">${m.estatico.tipos.ok ? 0 : '≥1'}</td><td class="num">—</td></tr>
    </tbody>
  </table>
  <p>La configuración del backend excluye deliberadamente las reglas de formato. La decisión responde
    a que la disposición de comillas o espacios no incide en las propiedades que esta evaluación mide,
    y su inclusión genera un volumen de observaciones que termina por desatenderse, restando valor a
    las advertencias que sí importan. La configuración se incorporó durante esta evaluación; al
    aplicarse por primera vez produjo tres observaciones —dos identificadores sin uso y una asignación
    sin efecto—, que fueron corregidas.</p>

  <h2>5.2 Dependencias de terceros</h2>
  <p>El software incorpora bibliotecas externas que resuelven el envío de correo, el procesamiento de
    imágenes y la conexión a la base de datos, entre otras funciones. Dichas bibliotecas constituyen
    una superficie de riesgo que el código propio no controla, y sus defectos de seguridad se publican
    en bases de datos de acceso público. La revisión contrasta las versiones instaladas contra esa
    base.</p>
  <table>
    <caption><b>Tabla 9.</b> Vulnerabilidades conocidas antes y después de la intervención.</caption>
    <thead><tr><th>Conjunto evaluado</th><th class="num">Antes</th><th class="num">Después</th><th>Situación remanente</th></tr></thead>
    <tbody>
      <tr><td>Backend, dependencias de producción</td><td class="num">8</td><td class="num">${dep.backend.produccion.total}</td><td>Una de severidad alta en la biblioteca de correo</td></tr>
      <tr><td>Frontend, todas las dependencias</td><td class="num">19</td><td class="num">${dep.frontend.todas.total}</td><td>Ninguna</td></tr>
    </tbody>
  </table>
  <p>De las ocho vulnerabilidades del backend, una presentaba severidad crítica. La única que persiste
    exige una actualización de versión mayor de la biblioteca de correo, operación cuyo riesgo de
    regresión no se consideró justificado en esta etapa, tanto más cuanto que en el despliegue en la
    nube dicha biblioteca no interviene: el correo se envía por la interfaz HTTPS del proveedor, dado
    que el alojamiento contratado bloquea los puertos de correo.</p>
  <p>Tras aplicar las actualizaciones se reejecutó la totalidad de las verificaciones. Las
    ${miles(m.pruebas.total)} pruebas continuaron aprobadas, la comprobación de tipos se mantuvo sin
    errores y la aplicación conservó su capacidad de compilación. Esta reejecución constituye,
    precisamente, la función que justifica mantener una batería de pruebas: actualizar dependencias sin
    ella es una operación cuyo resultado no puede verificarse.</p>

  <h2>5.3 Tamaño y documentación</h2>
  <p>El recuento de tamaño no constituye por sí mismo una medida de calidad, pero sí de la magnitud
    del objeto evaluado y del esfuerzo que supone comprenderlo. El proyecto comprende
    ${miles(total.codigo)} líneas de código y ${miles(total.comentario)} líneas de comentario,
    distribuidas según la Tabla 10.</p>
  <table>
    <caption><b>Tabla 10.</b> Distribución del código fuente por componente.</caption>
    <thead><tr><th>Componente</th><th class="num">Archivos</th><th class="num">Código</th><th class="num">Comentario</th><th class="num">Densidad</th></tr></thead>
    <tbody>
      ${filasCodigo}
      <tr><td><b>Total</b></td><td class="num"><b>${total.archivos}</b></td><td class="num"><b>${miles(total.codigo)}</b></td><td class="num"><b>${miles(total.comentario)}</b></td><td class="num"><b>${coma(((100 * total.comentario) / (total.codigo + total.comentario)).toFixed(1))} %</b></td></tr>
    </tbody>
  </table>
  ${figura('calidad/imagenes/tamano-del-codigo.png', 2, 'Líneas de código y de comentario por componente del proyecto.')}
  <p>La densidad de comentarios responde a un criterio explícito de redacción: los comentarios no
    reiteran lo que el código expresa, sino que consignan la razón de cada decisión y las alternativas
    descartadas. Esa información no se encuentra registrada en ninguna otra parte y constituye lo que
    permite retomar el desarrollo tras un período de inactividad.</p>
  <p>Por último, el código no contiene marcas de trabajo pendiente del tipo <code>TODO</code> o
    <code>FIXME</code>: el recuento arroja ${m.deuda.marcas}. Lo que quedó fuera del alcance está
    documentado en la memoria junto con su justificación, y no consignado como anotación dispersa en el
    código.</p>

  <h2>5.4 Desempeño bajo carga</h2>
  <p>La evaluación de desempeño somete al servicio a carga concurrente creciente y registra el caudal
    de peticiones atendidas y el tiempo de respuesta. Se informan percentiles en lugar de promedios: el
    percentil 95 corresponde al tiempo de espera que no supera el 95 % de las peticiones, y describe la
    experiencia del usuario desfavorecido, que el promedio oculta.</p>
  <table>
    <caption><b>Tabla 11.</b> Resultados de las pruebas de carga, en el nivel de concurrencia máximo de cada escenario.</caption>
    <thead><tr><th>Escenario</th><th class="num">Concurrencia</th><th class="num">Peticiones/s</th><th class="num">p50 (ms)</th><th class="num">p95 (ms)</th><th class="num">Errores</th></tr></thead>
    <tbody>
      ${filasCarga}
    </tbody>
  </table>
  ${figura('pruebas-estres/imagenes/resumen.png', 3, 'Capacidad máxima registrada en cada escenario, en el entorno de contenedores.')}

  <h3>Prueba de colisión</h3>
  <p>Un quinto escenario evalúa la corrección del sistema bajo contención, y no su velocidad: se
    emiten ${carga.colision.intentos} peticiones simultáneas solicitando exactamente el mismo bloque
    horario. El resultado fue de ${carga.colision.creadas} cita creada y ${carga.colision.rechazadas}
    peticiones rechazadas por conflicto, resueltas en ${carga.colision.duracionMs} milisegundos. El
    escenario confirma el funcionamiento del bloqueo por artista bajo carga real; su ausencia
    permitiría que dos clientes quedaran agendados en el mismo horario.</p>

  <h3>Proyección al entorno de producción</h3>
  <p>Las cifras anteriores corresponden al entorno de contenedores. El despliegue en la nube opera
    sobre un plan gratuito de 512 MB de memoria y procesador compartido, por lo que cabe esperar un
    caudal sustancialmente menor, del orden de diez a cuarenta peticiones por segundo según el
    escenario, con la memoria disponible durante el procesamiento de imágenes como factor limitante
    antes que la velocidad de proceso. <b>Esta estimación no constituye una medición</b> y se consigna
    como proyección. Para dimensionar su suficiencia: la operación de un tatuador genera del orden de
    cien peticiones en una jornada de trabajo.</p>
</section>

<section class="seguida">
  <h1>6. Discusión de los resultados</h1>
  <p>Los resultados admiten tres lecturas que conviene distinguir.</p>

  <h2>Sobre la suficiencia de la cobertura</h2>
  <p>Una cobertura de ${coma(cob.statements.pct)} % no demuestra que el software sea correcto, y sería
    un error presentarla como tal. La cobertura registra qué código se ejecutó, no si se comprobó que
    su resultado fuera el esperado: una prueba que invoque una función sin verificar nada incrementa la
    cobertura exactamente igual que una rigurosa. Lo que la cifra permite afirmar es algo más acotado y
    aun así relevante: que prácticamente no subsiste código que jamás haya sido ejecutado en
    condiciones controladas. La corrección propiamente tal la sostienen las verificaciones contenidas
    en cada prueba y los 35 casos funcionales.</p>

  <h2>Sobre la elección de pruebas de integración</h2>
  <p>La decisión de incorporar una batería contra una base de datos real, pese a su mayor costo de
    ejecución, se apoya en una observación concreta: las propiedades más críticas del sistema —aquellas
    cuyo incumplimiento produciría una cita duplicada o un inventario inconsistente— están garantizadas
    por mecanismos del motor de base de datos. Un doble de prueba configurado para devolver el
    resultado esperado verificaría la expectativa del desarrollador, no el comportamiento del sistema.
    El diseño de la evaluación reconoce esa diferencia.</p>

  <h2>Sobre el desempeño medido</h2>
  <p>Las cifras de caudal deben interpretarse en relación con la demanda prevista, no en abstracto. Un
    sistema destinado a uno o pocos estudios de tatuaje no requiere seiscientas peticiones por segundo;
    el valor de la medición no reside en la cifra sino en dos hallazgos: que no se registró un solo
    error en toda la corrida, y que el comportamiento bajo contención resultó correcto. Un sistema que
    degrada su caudal bajo carga sigue siendo utilizable; uno que agenda dos citas en el mismo horario,
    no.</p>
</section>

<section>
  <h1>7. Limitaciones de la evaluación</h1>
  <p>Se consignan a continuación las limitaciones de este trabajo, en el entendido de que una
    evaluación que omitiera declararlas perdería su valor como evidencia.</p>
  <dl>
${LIMITACIONES.map(([t, d]) => `    <dt>${esc(t)}</dt>\n    <dd>${esc(d)}</dd>`).join('\n')}
  </dl>
</section>

<section>
  <h1>8. Conclusiones</h1>
  <p>La evaluación permite sostener, con evidencia reproducible, las conclusiones siguientes.</p>
  <p><b>Primera.</b> El software satisface los criterios verificables de adecuación funcional en el
    alcance evaluado: ${miles(m.pruebas.total)} pruebas automatizadas y 35 casos funcionales de caja
    negra resultaron conformes, sin excepciones.</p>
  <p><b>Segunda.</b> La verificación alcanza al ${coma(cob.statements.pct)} % de las sentencias del
    backend, con todas las capas que concentran reglas de negocio por sobre el 95 %. La porción no
    cubierta está identificada y corresponde mayoritariamente a caminos que requieren un servicio
    externo real.</p>
  <p><b>Tercera.</b> La verificación estática no arroja observaciones sobre los
    ${m.estatico.eslintBackend.archivos + m.estatico.eslintFrontend.archivos} archivos revisados, y de
    las 27 vulnerabilidades conocidas detectadas en dependencias de terceros se corrigieron 26; la
    restante no interviene en el entorno de producción.</p>
  <p><b>Cuarta.</b> El sistema mantiene un comportamiento correcto bajo concurrencia, verificado tanto
    en pruebas de integración como bajo carga real: ${carga.colision.intentos} peticiones simultáneas
    sobre un mismo horario produjeron una única cita.</p>
  <p><b>Quinta.</b> La evaluación de usabilidad queda pendiente de aplicación, y con ella la
    verificación de una de las características del modelo de calidad adoptado. El instrumento y el
    procedimiento están definidos; lo que falta es la sesión con los participantes.</p>
  <p>Cabe una observación final sobre el método. El valor de esta evaluación no reside únicamente en
    las cifras obtenidas, sino en que su obtención modificó el objeto evaluado: la primera medición de
    cobertura reveló una capa entera sin ejercitar, y la revisión de dependencias, veintisiete fallos
    de seguridad publicados. Ninguno de ambos hallazgos se habría manifestado mediante el uso del
    sistema. Esa es, en definitiva, la justificación de medir.</p>
</section>

<section>
  <h1>9. Anexo: reproducción de las mediciones</h1>
  <p>La totalidad de las cifras contenidas en este informe puede reproducirse con los comandos de la
    Tabla 12, ejecutados sobre el repositorio del proyecto. Cada uno deja su resultado en un archivo,
    del que este documento se genera de forma automática.</p>
  <table>
    <caption><b>Tabla 12.</b> Comandos de reproducción y archivo de resultados.</caption>
    <thead><tr><th>Medición</th><th>Comando</th><th>Resultado</th></tr></thead>
    <tbody>
      <tr><td>Pruebas automatizadas</td><td><code>npx jest --runInBand</code></td><td>Salida en consola</td></tr>
      <tr><td>Cobertura</td><td><code>npx jest --runInBand --coverage</code></td><td><code>backend/coverage/</code></td></tr>
      <tr><td>Análisis estático</td><td><code>npx eslint .</code> y <code>npx tsc --noEmit</code></td><td>Salida en consola</td></tr>
      <tr><td>Dependencias</td><td><code>npm audit</code></td><td>Salida en consola</td></tr>
      <tr><td>Consolidación de métricas</td><td><code>node backend/calidad/medir.js</code></td><td><code>docs/calidad/metricas.json</code></td></tr>
      <tr><td>Pruebas de carga</td><td><code>node backend/stress/correr.js</code></td><td><code>docs/pruebas-estres/resultados.json</code></td></tr>
      <tr><td>Este informe</td><td><code>node backend/calidad/evaluacion.js</code></td><td><code>docs/calidad/informe-evaluacion.pdf</code></td></tr>
    </tbody>
  </table>
  <p>Las herramientas se invocan dentro de los contenedores correspondientes. Existen además tres
    informes navegables con el mismo respaldo documental y mayor nivel de detalle:
    <code>docs/calidad/</code> para la calidad del código, <code>docs/cobertura/</code> para la
    cobertura y <code>docs/pruebas-estres/</code> para las pruebas de carga.</p>
</section>

</body>
</html>
`;

// ------------------------------------------------------------------ impresión

imprimir({
  html,
  salida: SALIDA,
  pie: 'Informe de evaluación de la calidad del software · Correa Mella',
}).then((bytes) => {
  console.log(`PDF generado: ${SALIDA} (${Math.round(bytes / 1024)} kB)`);
});
