/**
 * Imprime un documento HTML a PDF con Chrome en modo headless.
 *
 *   await imprimir({ html, salida, pie });
 *
 * Lo usan los dos informes en PDF de esta carpeta. Se habla con el navegador
 * por el protocolo de depuración (CDP) sobre el `ws` que el backend ya tiene
 * instalado, así que no agrega dependencias: Puppeteer traería un Chromium
 * entero para hacer exactamente esta llamada.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const WebSocket = require(path.join(__dirname, '..', 'node_modules', 'ws'));

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PUERTO = 9444;

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function wsDelNavegador(puerto) {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${puerto}/json/list`);
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

/**
 * @param {string} html      documento completo
 * @param {string} salida    ruta del PDF a escribir
 * @param {string} pie       texto del pie de página (el número va a la derecha)
 */
async function imprimir({ html, salida, pie = '' }) {
  const temporal = path.join(os.tmpdir(), `informe-${Date.now()}.html`);
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
    const cdp = cliente(await wsDelNavegador(PUERTO));
    await cdp.abierto();
    await cdp.enviar('Page.enable');
    const cargado = cdp.alEvento('Page.loadEventFired');
    await cdp.enviar('Page.navigate', { url: `file:///${temporal.split('\\').join('/')}` });
    await cargado;
    await espera(1200); // fuentes e imágenes

    const footerTemplate = pie
      ? '<div style="width:100%;font-size:8pt;color:#8b95a1;padding:0 16mm;' +
        'font-family:Segoe UI,Helvetica,sans-serif;display:flex;justify-content:space-between">' +
        `<span>${pie}</span><span class="pageNumber"></span></div>`
      : '<span></span>';

    const { data } = await cdp.enviar('Page.printToPDF', {
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: Boolean(pie),
      headerTemplate: '<span></span>',
      footerTemplate,
      marginTop: 0.7,
      marginBottom: 0.7,
      marginLeft: 0.63,
      marginRight: 0.63,
    });

    fs.mkdirSync(path.dirname(salida), { recursive: true });
    fs.writeFileSync(salida, Buffer.from(data, 'base64'));
    cdp.cerrar();
    return fs.statSync(salida).size;
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
}

module.exports = { imprimir };
