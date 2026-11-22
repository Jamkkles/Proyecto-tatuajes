/**
 * Dibuja las hojas de la planilla de medición y las deja como las figuras del
 * Capítulo 5 de la memoria.
 *
 *   node backend/medicion/capturas.js
 *
 * Lee docs/medicion/planilla-medicion.xlsx (valores, rellenos, bordes, anchos y
 * formatos de número que el propio archivo trae), arma una página HTML con el
 * aspecto de Excel y la captura con Chrome headless por CDP, igual que
 * calidad/imprimir.js: no agrega dependencias. Deja en tesis/imagenes una
 * imagen por hoja (fig-5-4 a fig-5-7).
 *
 * Si se corrige un dato de la planilla hay que volver a correrlo: las figuras
 * de la memoria son esta captura, no una transcripción.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const RAIZ = path.join(__dirname, '..', '..');

const zlib = require('zlib');

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


const XLSX = path.join(RAIZ, 'docs', 'medicion', 'planilla-medicion.xlsx');
const DESTINO = path.join(RAIZ, 'tesis', 'imagenes');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const WS = require(path.join(__dirname, '..', 'node_modules', 'ws'));
const PUERTO = 9455;

const SALIDAS = {
  'Cotización': 'fig-5-4-planilla-cotizacion.png',
  'Previsualización': 'fig-5-5-planilla-previsualizacion.png',
  'Inasistencia': 'fig-5-6-planilla-inasistencia.png',
  'Resumen': 'fig-5-7-planilla-resumen.png',
};

// ---------------------------------------------------------------- lectura ---
const dec = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const files = leerZip(XLSX);
const xml = (k) => files[k].toString('utf8');

const compartidas = [];
for (const m of xml('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)) {
  let t = '';
  for (const tm of m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) t += tm[1];
  compartidas.push(dec(t));
}

const estilos = (() => {
  const s = xml('xl/styles.xml');
  const numFmts = {};
  for (const m of s.matchAll(/<numFmt numFmtId="(\d+)" formatCode="([^"]*)"/g)) numFmts[m[1]] = dec(m[2]);

  const fuentes = [...(s.match(/<fonts[\s\S]*?<\/fonts>/) || [''])[0].matchAll(/<font>([\s\S]*?)<\/font>/g)].map((m) => ({
    negrita: /<b\/>/.test(m[1]),
    cursiva: /<i\/>/.test(m[1]),
    subrayado: /<u\/>/.test(m[1]),
    tam: Number((m[1].match(/<sz val="([\d.]+)"/) || [])[1] || 11),
    color: (m[1].match(/<color rgb="FF([0-9A-Fa-f]{6})"/) || [])[1] || null,
  }));

  const rellenos = [...(s.match(/<fills[\s\S]*?<\/fills>/) || [''])[0].matchAll(/<fill>([\s\S]*?)<\/fill>/g)].map((m) => {
    const c = m[1].match(/patternType="solid"[\s\S]*?fgColor rgb="FF([0-9A-Fa-f]{6})"/);
    return c ? '#' + c[1] : null;
  });

  const bordes = [...(s.match(/<borders[\s\S]*?<\/borders>/) || [''])[0].matchAll(/<border>([\s\S]*?)<\/border>/g)].map((m) => {
    const c = m[1].match(/<left style="thin"><color rgb="FF([0-9A-Fa-f]{6})"/);
    return c ? '#' + c[1] : null;
  });

  const xfs = [...(s.match(/<cellXfs[\s\S]*?<\/cellXfs>/) || [''])[0].matchAll(/<xf ([^>]*?)(?:\/>|>([\s\S]*?)<\/xf>)/g)].map((m) => {
    const at = (n) => Number((m[1].match(new RegExp(n + '="(\\d+)"')) || [])[1] || 0);
    const al = (m[2] || '').match(/<alignment([^>]*)\/>/);
    return {
      numFmtId: at('numFmtId'), fontId: at('fontId'), fillId: at('fillId'), borderId: at('borderId'),
      ajusta: Boolean(al && /wrapText="1"/.test(al[1])),
    };
  });

  return { numFmts, fuentes, rellenos, bordes, xfs };
})();

function formatear(valor, numFmtId) {
  const codigo = estilos.numFmts[numFmtId] || { 0: 'General', 49: '@' }[numFmtId] || 'General';
  if (codigo === '@' || codigo === 'General') {
    if (typeof valor !== 'number') return String(valor);
    const r = Math.round(valor * 1e10) / 1e10;
    return Number.isInteger(r) ? String(r) : String(r).replace('.', ',');
  }
  if (codigo === '0.0%') return (valor * 100).toFixed(1).replace('.', ',') + '%';
  if (codigo === '0.0') return Number(valor).toFixed(1).replace('.', ',');
  return String(valor);
}

const col = (ref) => ref.match(/^[A-Z]+/)[0];
const numCol = (letras) => [...letras].reduce((a, c) => a * 26 + (c.charCodeAt(0) - 64), 0);
const letraCol = (n) => { let s = ''; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = (n - 1 - r) / 26; } return s; };

function leerHoja(clave) {
  const x = xml(clave);
  const celdas = {};
  for (const rm of x.matchAll(/<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const fila = Number(rm[1]);
    for (const cm of rm[2].matchAll(/<c\s+([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1] || '', inner = cm[2] || '';
      const ref = (attrs.match(/r="([A-Z]+\d+)"/) || [])[1];
      if (!ref) continue;
      const t = (attrs.match(/t="([^"]*)"/) || [])[1];
      const s = Number((attrs.match(/s="(\d+)"/) || [])[1] || 0);
      const vm = inner.match(/<v>([\s\S]*?)<\/v>/);
      let valor = null;
      if (t === 's') valor = compartidas[Number(vm[1])];
      else if (t === 'inlineStr') { const im = inner.match(/<t[^>]*>([\s\S]*?)<\/t>/); valor = im ? dec(im[1]) : ''; }
      else if (vm) valor = t === 'str' ? dec(vm[1]) : Number(vm[1]);
      celdas[ref] = { fila, columna: numCol(col(ref)), valor, s };
    }
  }
  const anchos = {};
  for (const m of (x.match(/<cols>[\s\S]*?<\/cols>/) || [''])[0].matchAll(/<col min="(\d+)" max="(\d+)" width="([\d.]+)"/g)) {
    for (let c = Number(m[1]); c <= Number(m[2]); c++) anchos[c] = Number(m[3]);
  }
  const fusiones = [...(x.match(/<mergeCells[\s\S]*?<\/mergeCells>/) || [''])[0].matchAll(/ref="([A-Z]+\d+):([A-Z]+\d+)"/g)]
    .map((m) => ({
      c1: numCol(col(m[1])), f1: Number(m[1].replace(/\D/g, '')),
      c2: numCol(col(m[2])), f2: Number(m[2].replace(/\D/g, '')),
    }));
  return { celdas, anchos, fusiones };
}

// --------------------------------------------------------------- dibujado ---
function html(nombreHoja, hoja) {
  const con = Object.values(hoja.celdas).filter((c) => c.valor !== null && c.valor !== '');
  const maxCol = Math.max(...con.map((c) => c.columna));
  const maxFila = Math.max(...con.map((c) => c.fila));

  const tapada = new Set();
  const principal = new Map();
  for (const m of hoja.fusiones) {
    if (m.c1 > maxCol || m.f1 > maxFila) continue;
    principal.set(m.f1 + ':' + m.c1, { cols: Math.min(m.c2, maxCol) - m.c1 + 1, filas: m.f2 - m.f1 + 1 });
    for (let f = m.f1; f <= m.f2; f++) for (let c = m.c1; c <= Math.min(m.c2, maxCol); c++) {
      if (!(f === m.f1 && c === m.c1)) tapada.add(f + ':' + c);
    }
  }

  const px = (c) => Math.round((hoja.anchos[c] || 9.14) * 7) + 5;
  let ancho = 34;
  for (let c = 1; c <= maxCol; c++) ancho += px(c);

  let cuerpo = `<table class="hoja" style="width:${ancho}px"><colgroup><col style="width:34px">`;
  for (let c = 1; c <= maxCol; c++) cuerpo += `<col style="width:${px(c)}px">`;
  cuerpo += '</colgroup><thead><tr><th class="esq"></th>';
  for (let c = 1; c <= maxCol; c++) cuerpo += `<th class="cab">${letraCol(c)}</th>`;
  cuerpo += '</tr></thead><tbody>';

  for (let f = 1; f <= maxFila; f++) {
    cuerpo += `<tr><td class="num">${f}</td>`;
    for (let c = 1; c <= maxCol; c++) {
      if (tapada.has(f + ':' + c)) continue;
      const celda = hoja.celdas[letraCol(c) + f];
      const xf = estilos.xfs[celda ? celda.s : 0] || estilos.xfs[0];
      const fuente = estilos.fuentes[xf.fontId] || estilos.fuentes[0];
      const relleno = estilos.rellenos[xf.fillId];
      const borde = estilos.bordes[xf.borderId];
      const combina = principal.get(f + ':' + c);

      const est = [];
      if (relleno) est.push('background:' + relleno);
      if (borde) est.push('border:1px solid ' + borde);
      if (fuente.negrita) est.push('font-weight:700');
      if (fuente.cursiva) est.push('font-style:italic');
      if (fuente.subrayado) est.push('text-decoration:underline');
      if (fuente.tam !== 11) est.push('font-size:' + (fuente.tam * 96 / 72).toFixed(1) + 'px');
      if (fuente.color) est.push('color:#' + fuente.color);
      if (xf.ajusta) est.push('white-space:normal');

      let texto = '';
      let clase = '';
      if (celda && celda.valor !== null && celda.valor !== '') {
        texto = esc(formatear(celda.valor, xf.numFmtId));
        if (typeof celda.valor === 'number') clase = ' class="der"';
      }

      // Excel deja que un texto largo se derrame sobre las celdas vacías de su
      // derecha; sin esto los títulos saldrían cortados a la mitad.
      if (texto && !clase && !relleno && !borde && !xf.ajusta && !combina) {
        const vecina = hoja.celdas[letraCol(c + 1) + f];
        if (c < maxCol && (!vecina || vecina.valor === null || vecina.valor === '')) {
          est.push('overflow:visible', 'position:relative', 'z-index:1');
        }
      }
      const span = combina && combina.cols > 1 ? ` colspan="${combina.cols}"` : '';
      cuerpo += `<td${span}${clase} style="${est.join(';')}">${texto || '&nbsp;'}</td>`;
    }
    cuerpo += '</tr>';
  }
  cuerpo += '</tbody></table>';

  return `<!doctype html><meta charset="utf-8"><title>${esc(nombreHoja)}</title>
<style>
  body { margin:0; background:#fff; font-family:Calibri,"Segoe UI",sans-serif; }
  #marco { display:inline-block; padding:0; background:#fff; }
  table.hoja { border-collapse:collapse; table-layout:fixed; font-size:14.7px; color:#000; }
  table.hoja td, table.hoja th { height:20px; padding:0 3px; overflow:hidden;
    white-space:nowrap; vertical-align:middle; border:1px solid #d9d9d9; }
  th.cab, td.num { background:#f0f0f0; color:#444; font-weight:600; text-align:center;
    font-size:12px; border:1px solid #c6c6c6; }
  td.num { text-align:center; }
  th.esq { background:#f0f0f0; border:1px solid #c6c6c6; }
  td.der { text-align:right; }
  .pestana { display:inline-block; margin:0 0 -1px 34px; padding:3px 14px; font-size:13px;
    border:1px solid #c6c6c6; border-bottom:1px solid #fff; background:#fff; font-weight:700; }
</style>
<div id="marco"><span class="pestana">${esc(nombreHoja)}</span>${cuerpo}</div>`;
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
  const wb = xml('xl/workbook.xml');
  const rels = xml('xl/_rels/workbook.xml.rels');
  const mapaRel = {};
  for (const m of rels.matchAll(/Id="(rId\d+)"[^>]*Target="([^"]*)"/g)) mapaRel[m[1]] = 'xl/' + m[2].replace(/^\/?xl\//, '');
  const hojas = [...wb.matchAll(/<sheet[^>]*name="([^"]*)"[^>]*r:id="(rId\d+)"/g)].map((m) => [dec(m[1]), mapaRel[m[2]]]);

  const temporales = [];
  for (const [nombre, clave] of hojas) {
    if (!SALIDAS[nombre]) continue;
    const ruta = path.join(os.tmpdir(), `hoja-${Date.now()}-${SALIDAS[nombre]}.html`);
    fs.writeFileSync(ruta, html(nombre, leerHoja(clave)), 'utf8');
    temporales.push({ nombre, ruta, salida: path.join(DESTINO, SALIDAS[nombre]) });
  }

  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-planilla-'));
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

      await cdp.enviar('Emulation.setDeviceMetricsOverride', {
        width: w + 24, height: h + 24, deviceScaleFactor: 2, mobile: false,
      });
      await espera(250);

      const { data } = await cdp.enviar('Page.captureScreenshot', {
        format: 'png', captureBeyondViewport: true,
        clip: { x: 0, y: 0, width: w + 2, height: h + 2, scale: 2 },
      });
      fs.writeFileSync(t.salida, Buffer.from(data, 'base64'));
      console.log(`${t.nombre}: ${path.basename(t.salida)}  ${w}x${h} css  ->  ${(fs.statSync(t.salida).size / 1024).toFixed(0)} KB`);
    }
    cdp.cerrar();
  } finally {
    chrome.kill();
    for (const t of temporales) fs.rmSync(t.ruta, { force: true });
    await espera(700);
    try { fs.rmSync(perfil, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); } catch { /* lo limpia el sistema */ }
  }
})();
