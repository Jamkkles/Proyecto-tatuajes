/**
 * Dibuja la Carta Gantt del proyecto y la deja como las dos figuras del
 * Anexo A.1 de la memoria.
 *
 *   node tesis/gantt.js
 *
 * Lee docs/Carta Gantt_Pablo Correa (1).xlsx (la planificación tal como se
 * armó en Excel), arma una página HTML y la captura con Chrome headless por
 * CDP, igual que backend/medicion/capturas.js y backend/calidad/imprimir.js:
 * no agrega dependencias. Deja en tesis/imagenes:
 *
 *   fig-a-1-gantt-1.png   semanas 1 a 16 (primer semestre)
 *   fig-a-2-gantt-2.png   semanas 17 a 30 (segundo semestre)
 *
 * La planilla marca cada semana trabajada con una «x» de color; aquí esa marca
 * se dibuja como una barra llena del mismo color, que es lo único legible
 * cuando la figura se reduce al ancho de la página. Los datos son los mismos:
 * si se corrige la planilla hay que volver a correr este guion.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { spawn } = require('child_process');

const RAIZ = path.join(__dirname, '..');
const XLSX = path.join(RAIZ, 'docs', 'Carta Gantt_Pablo Correa (1).xlsx');
const DESTINO = path.join(RAIZ, 'tesis', 'imagenes');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const WS = require(path.join(RAIZ, 'backend', 'node_modules', 'ws'));
const PUERTO = 9456;

// Colores tomados de la propia planilla.
const CABECERA = '#115E59';
const FASE_FONDO = '#D9EAD3';
const FASE_BARRA = '#115E59';
const FASE_TEXTO = '#134E4A';
const TAREA_BARRA = '#3B82F6';
const TAREA_TEXTO = '#1F2937';
const LINEA = '#CBD5E1';

// --------------------------------------------------------------- lectura ---
function leerZip(ruta) {
  const buf = fs.readFileSync(ruta);
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) { if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; } }
  if (eocd === -1) throw new Error('no es un zip: ' + ruta);
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const files = {};
  for (let i = 0; i < count; i++) {
    const nameLen = buf.readUInt16LE(off + 28), extraLen = buf.readUInt16LE(off + 30), commentLen = buf.readUInt16LE(off + 32);
    const localOff = buf.readUInt32LE(off + 42);
    const name = buf.toString('utf8', off + 46, off + 46 + nameLen);
    const method = buf.readUInt16LE(off + 10);
    const compSize = buf.readUInt32LE(off + 20);
    const lnameLen = buf.readUInt16LE(localOff + 26), lextraLen = buf.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + lnameLen + lextraLen;
    const data = buf.slice(dataStart, dataStart + compSize);
    files[name] = method === 0 ? data : zlib.inflateRawSync(data);
    off += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

const dec = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const numCol = (letras) => [...letras].reduce((a, c) => a * 26 + (c.charCodeAt(0) - 64), 0);

function leerPlanilla() {
  const files = leerZip(XLSX);
  const compartidas = [];
  for (const m of files['xl/sharedStrings.xml'].toString('utf8').matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    let t = '';
    for (const tm of m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) t += tm[1];
    compartidas.push(dec(t));
  }
  const x = files['xl/worksheets/sheet1.xml'].toString('utf8');
  const filas = [];
  for (const rm of x.matchAll(/<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const celdas = {};
    for (const cm of rm[2].matchAll(/<c\s+([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1], inner = cm[2] || '';
      const ref = (attrs.match(/r="([A-Z]+)\d+"/) || [])[1];
      if (!ref) continue;
      const t = (attrs.match(/t="([^"]*)"/) || [])[1];
      const vm = inner.match(/<v>([\s\S]*?)<\/v>/);
      if (!vm) continue;
      celdas[numCol(ref)] = t === 's' ? compartidas[Number(vm[1])] : dec(vm[1]);
    }
    filas.push({ n: Number(rm[1]), celdas });
  }

  // Las tareas van de la fila 3 a la 29; antes está la cabecera y después el
  // bloque de resumen.
  const tareas = [];
  for (const f of filas) {
    if (f.n < 3 || f.n > 29) continue;
    const codigo = f.celdas[1];
    if (!codigo) continue;
    const semanas = new Set();
    // E..T = semanas 1 a 16; V..AI = semanas 17 a 30 (U es el separador).
    for (let c = 5; c <= 20; c++) if (f.celdas[c]) semanas.add(c - 4);
    for (let c = 22; c <= 35; c++) if (f.celdas[c]) semanas.add(c - 5);
    tareas.push({
      codigo,
      nombre: f.celdas[2] || '',
      inicio: f.celdas[3] || '',
      estado: f.celdas[4] || '',
      esFase: /^F/.test(codigo),
      semanas,
    });
  }
  return tareas;
}

// --------------------------------------------------------------- dibujado ---
function html(tareas, desde, hasta, subtitulo) {
  const semanas = [];
  for (let s = desde; s <= hasta; s++) semanas.push(s);

  let filas = '';
  for (const t of tareas) {
    const fondo = t.esFase ? FASE_FONDO : '#FFFFFF';
    const color = t.esFase ? FASE_TEXTO : TAREA_TEXTO;
    const barra = t.esFase ? FASE_BARRA : TAREA_BARRA;
    const peso = t.esFase ? '700' : '400';
    let celdas = '';
    for (const s of semanas) {
      celdas += t.semanas.has(s)
        ? `<td class="sem"><span class="barra" style="background:${barra}"></span></td>`
        : '<td class="sem"></td>';
    }
    filas += `<tr style="background:${fondo};color:${color};font-weight:${peso}">`
      + `<td class="cod">${esc(t.codigo)}</td>`
      + `<td class="nom">${esc(t.nombre)}</td>`
      + `<td class="ini">${esc(t.inicio)}</td>`
      + `<td class="est">${esc(t.estado)}</td>${celdas}</tr>`;
  }

  const cabSemanas = semanas.map((s) => `<th class="sem"><span>Semana ${s}</span></th>`).join('');
  // `table-layout: fixed` solo respeta los anchos si la tabla tiene uno propio.
  const ancho = 58 + 300 + 46 + 74 + semanas.length * 26;

  return `<!doctype html><meta charset="utf-8"><title>Carta Gantt</title>
<style>
  body { margin:0; background:#fff; font-family:Carlito,Calibri,"Segoe UI",sans-serif; }
  #marco { display:inline-block; background:#fff; }
  table { border-collapse:collapse; table-layout:fixed; font-size:11.5px; }
  th, td { border:1px solid ${LINEA}; padding:2px 4px; vertical-align:middle; }
  thead th { background:${CABECERA}; color:#fff; font-weight:700; font-size:11px; }
  th.sem, td.sem { width:26px; padding:0; text-align:center; }
  th.sem span { writing-mode:vertical-rl; transform:rotate(180deg); white-space:nowrap;
    display:inline-block; padding:6px 0; font-size:10.5px; }
  td.cod { width:58px; font-family:Consolas,monospace; font-size:10.5px; }
  td.nom { width:300px; white-space:normal; line-height:1.15; }
  td.ini { width:46px; text-align:center; }
  td.est { width:74px; text-align:center; font-size:10.5px; }
  .barra { display:block; width:100%; height:15px; }
  .titulo { background:${CABECERA}; color:#fff; font-weight:700; font-size:13px;
    padding:6px 8px; border:1px solid ${CABECERA}; }
</style>
<div id="marco">
  <div class="titulo" style="width:${ancho - 2}px">Carta Gantt &mdash; Proyecto de 30 semanas &nbsp;·&nbsp; ${esc(subtitulo)}</div>
  <table style="width:${ancho}px">
    <thead><tr>
      <th>Código</th><th>Nombre de la tarea</th><th>Inicio</th><th>Estado</th>${cabSemanas}
    </tr></thead>
    <tbody>${filas}</tbody>
  </table>
</div>`;
}

// ----------------------------------------------------------------- captura ---
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function wsNavegador() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PUERTO}/json/list`);
      const p = (await res.json()).find((t) => t.type === 'page');
      if (p?.webSocketDebuggerUrl) return p.webSocketDebuggerUrl;
    } catch { /* todavía no abre */ }
    await espera(500);
  }
  throw new Error('Chrome no expuso el puerto de depuración');
}

function cliente(url) {
  const ws = new WS(url, { maxPayload: 256 * 1024 * 1024 });
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
    enviar: (method, params = {}) => new Promise((resolve, reject) => {
      const m = { id: ++id, method, params };
      pendientes.set(m.id, { resolve, reject });
      ws.send(JSON.stringify(m));
    }),
    alEvento: (method) => new Promise((resolve) => {
      if (!eventos.has(method)) eventos.set(method, []);
      eventos.get(method).push(resolve);
    }),
    cerrar: () => ws.close(),
  };
}

(async () => {
  const tareas = leerPlanilla();
  console.log(tareas.length + ' filas leídas (' + tareas.filter((t) => t.esFase).length + ' etapas)');

  const partes = [
    { desde: 1, hasta: 16, sub: 'primera parte, semanas 1 a 16', salida: 'fig-a-1-gantt-1.png' },
    { desde: 17, hasta: 30, sub: 'segunda parte, semanas 17 a 30', salida: 'fig-a-2-gantt-2.png' },
  ];

  const temporales = partes.map((p) => {
    const ruta = path.join(os.tmpdir(), `gantt-${Date.now()}-${p.salida}.html`);
    fs.writeFileSync(ruta, html(tareas, p.desde, p.hasta, p.sub), 'utf8');
    return { ...p, ruta, destino: path.join(DESTINO, p.salida) };
  });

  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-gantt-'));
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${PUERTO}`, `--user-data-dir=${perfil}`,
    '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
    '--force-device-scale-factor=2', '--font-render-hinting=none', 'about:blank',
  ], { stdio: 'ignore' });

  try {
    const cdp = cliente(await wsNavegador());
    await cdp.abierto();
    await cdp.enviar('Page.enable');

    for (const t of temporales) {
      const cargado = cdp.alEvento('Page.loadEventFired');
      await cdp.enviar('Page.navigate', { url: 'file:///' + t.ruta.split('\\').join('/') });
      await cargado;
      await espera(500);

      const { result } = await cdp.enviar('Runtime.evaluate', {
        expression: 'const r = document.getElementById("marco").getBoundingClientRect();'
          + 'JSON.stringify({w: Math.ceil(r.width), h: Math.ceil(r.height)})',
        returnByValue: true,
      });
      const { w, h } = JSON.parse(result.value);

      await cdp.enviar('Emulation.setDeviceMetricsOverride', { width: w + 24, height: h + 24, deviceScaleFactor: 2, mobile: false });
      await espera(250);

      const { data } = await cdp.enviar('Page.captureScreenshot', {
        format: 'png', captureBeyondViewport: true,
        clip: { x: 0, y: 0, width: w + 2, height: h + 2, scale: 2 },
      });
      fs.writeFileSync(t.destino, Buffer.from(data, 'base64'));
      console.log(`${path.basename(t.destino)}  ${w}x${h} css  ->  ${(fs.statSync(t.destino).size / 1024).toFixed(0)} KB`);
    }
    cdp.cerrar();
  } finally {
    chrome.kill();
    for (const t of temporales) fs.rmSync(t.ruta, { force: true });
    await espera(700);
    try { fs.rmSync(perfil, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); } catch { /* lo limpia el sistema */ }
  }
})();
