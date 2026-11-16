/**
 * Pruebas de carga y estrés de la API.
 *
 *   node backend/stress/correr.js
 *
 * No usa dependencias: solo `fetch` y los módulos de Node, así que corre en el
 * host aunque el servidor esté en Docker. Mide cada petición por separado y
 * reporta percentiles, no promedios: el promedio esconde justamente lo que
 * importa de una prueba de carga, que es cuánto espera el usuario que peor lo
 * pasa.
 *
 * Escenarios:
 *   1. Lectura de la agenda (consulta con dos JOIN, lo que carga el calendario)
 *   2. Cálculo de una cotización (el motor recorre los 42 insumos y empareja colores)
 *   3. Agendado de citas (escritura con bloqueo por artista)
 *   4. Subida de bocetos (optimización de la imagen con sharp)
 *   5. Colisión: muchas peticiones a la misma hora, para comprobar que el
 *      bloqueo aguanta bajo carga y no se agendan dos citas
 *
 * Deja el detalle en docs/pruebas-estres/resultados.json y borra al terminar
 * todo lo que creó.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const BASE = process.env.BASE ?? 'http://localhost:3000';
const SALIDA = path.join(__dirname, '..', '..', 'docs', 'pruebas-estres', 'resultados.json');
const IMAGEN = path.join(__dirname, '..', '..', 'frontend', 'public', 'logo.png');

const NIVELES = [1, 5, 10, 25, 50];
const PETICIONES = Number(process.env.PETICIONES ?? 300);
const NIVELES_SUBIDA = [1, 2, 4, 8];
const PETICIONES_SUBIDA = Number(process.env.PETICIONES_SUBIDA ?? 40);
const COLISIONES = Number(process.env.COLISIONES ?? 50);

const estado = { creados: { sketches: [], clients: [] } };

// ---------------------------------------------------------------- utilidades

async function peticion(metodo, ruta, { token, json, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let body;
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  } else if (form) {
    body = form;
  }
  const inicio = performance.now();
  const res = await fetch(`${BASE}${ruta}`, { method: metodo, headers, body });
  const texto = await res.text(); // se consume el cuerpo: el tiempo incluye la transferencia
  const ms = performance.now() - inicio;
  let cuerpo;
  try {
    cuerpo = texto ? JSON.parse(texto) : null;
  } catch {
    cuerpo = null;
  }
  return { status: res.status, body: cuerpo, ms };
}

const percentil = (ordenadas, p) => ordenadas[Math.min(ordenadas.length - 1, Math.ceil(p * ordenadas.length) - 1)];

function resumir(muestras, duracionMs) {
  const lat = muestras.map((m) => m.ms).sort((a, b) => a - b);
  const estados = {};
  for (const m of muestras) estados[m.status] = (estados[m.status] ?? 0) + 1;
  const redondea = (n) => Math.round(n * 10) / 10;
  return {
    peticiones: muestras.length,
    duracionMs: Math.round(duracionMs),
    rps: redondea((muestras.length / duracionMs) * 1000),
    latencia: {
      media: redondea(lat.reduce((a, b) => a + b, 0) / lat.length),
      p50: redondea(percentil(lat, 0.5)),
      p90: redondea(percentil(lat, 0.9)),
      p95: redondea(percentil(lat, 0.95)),
      p99: redondea(percentil(lat, 0.99)),
      max: redondea(lat[lat.length - 1]),
    },
    estados,
  };
}

/** Lanza `total` peticiones manteniendo `concurrencia` en vuelo. */
async function cargar(concurrencia, total, hacer) {
  const muestras = [];
  let siguiente = 0;
  const inicio = performance.now();
  const obreros = Array.from({ length: concurrencia }, async () => {
    for (;;) {
      const i = siguiente++;
      if (i >= total) return;
      muestras.push(await hacer(i));
    }
  });
  await Promise.all(obreros);
  return resumir(muestras, performance.now() - inicio);
}

async function rampa({ id, nombre, descripcion, niveles, peticiones, hacer, preparar }) {
  process.stdout.write(`\n${nombre}\n`);
  const medidas = [];
  // Cada petición recibe un número distinto, también las de calentamiento: así
  // el agendado nunca pide dos veces la misma hora y los 409 que aparezcan son
  // de verdad y no un efecto de la prueba.
  let n = 0;
  const siguiente = () => hacer(n++);
  for (const concurrencia of niveles) {
    if (preparar) await preparar();
    await cargar(1, Math.min(10, peticiones), siguiente); // calentamiento, no se mide
    const r = await cargar(concurrencia, peticiones, siguiente);
    medidas.push({ concurrencia, ...r });
    const estados = Object.entries(r.estados)
      .map(([c, n]) => `${c}×${n}`)
      .join(' ');
    process.stdout.write(
      `  ${String(concurrencia).padStart(3)} en paralelo → ${String(r.rps).padStart(7)} pet/s` +
        `   p50 ${String(r.latencia.p50).padStart(7)} ms   p95 ${String(r.latencia.p95).padStart(7)} ms` +
        `   p99 ${String(r.latencia.p99).padStart(7)} ms   ${estados}\n`
    );
  }
  return { id, nombre, descripcion, medidas };
}

// ---------------------------------------------------------------- preparación

const enDias = (dias, hora = 10, minuto = 0) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + dias);
  d.setUTCHours(hora, minuto, 0, 0);
  return d.toISOString();
};

async function preparar() {
  const sello = Date.now().toString(36);
  const correo = `carga-${sello}@pruebas.local`;
  const registro = await peticion('POST', '/api/auth/register', {
    json: { name: 'Artista de carga', email: correo, password: 'pruebas-de-carga-2026' },
  });
  if (registro.status !== 201) throw new Error(`no pude crear la cuenta: ${registro.status}`);
  const token = registro.body.token;

  // El kit de 42 insumos se siembra al entrar por primera vez al inventario:
  // se hace aquí para que no distorsione la primera cotización medida.
  await peticion('GET', '/api/materials', { token });

  const cliente = await peticion('POST', '/api/clients', {
    token,
    json: { name: 'Cliente de carga', phone: '+56911112222' },
  });
  estado.creados.clients.push(cliente.body.client.id);

  const proyecto = await peticion('POST', '/api/projects', {
    token,
    json: { clientId: cliente.body.client.id, title: 'Proyecto de carga', totalPrice: 200000 },
  });

  const form = new FormData();
  form.append('image', new Blob([fs.readFileSync(IMAGEN)], { type: 'image/png' }), 'boceto.png');
  form.append('title', 'Boceto de carga');
  const boceto = await peticion('POST', '/api/sketches', { token, form });
  estado.creados.sketches.push(boceto.body.sketch.id);

  // Agenda con algo de historia, para que la consulta del calendario trabaje.
  for (let i = 0; i < 40; i++) {
    await peticion('POST', '/api/sessions', {
      token,
      json: {
        projectId: proyecto.body.project.id,
        startsAt: enDias(60 + i, 9 + (i % 8)),
        durationMinutes: 60,
        price: 50000,
      },
    });
  }

  return { token, correo, clientId: cliente.body.client.id, projectId: proyecto.body.project.id, sketchId: boceto.body.sketch.id };
}

async function limpiar(ctx) {
  for (const id of estado.creados.sketches) {
    await peticion('DELETE', `/api/sketches/${id}`, { token: ctx.token }).catch(() => {});
  }
  // Borrar el cliente se lleva en cascada sus proyectos, sesiones y fotos.
  for (const id of estado.creados.clients) {
    await peticion('DELETE', `/api/clients/${id}`, { token: ctx.token }).catch(() => {});
  }
}

// ---------------------------------------------------------------- escenarios

async function main() {
  process.stdout.write(`Pruebas de carga contra ${BASE}\n`);
  const ctx = await preparar();
  const { token } = ctx;
  const imagen = fs.readFileSync(IMAGEN);
  const escenarios = [];

  escenarios.push(
    await rampa({
      id: 'agenda',
      nombre: '1. Lectura de la agenda del mes',
      descripcion:
        'GET /api/sessions con rango de un mes. Es la consulta que carga el calendario: une sesiones, proyectos y clientes, y busca el último recordatorio de cada cita.',
      niveles: NIVELES,
      peticiones: PETICIONES,
      hacer: () =>
        peticion('GET', `/api/sessions?from=${enDias(55)}&to=${enDias(115)}`, { token }),
    })
  );

  escenarios.push(
    await rampa({
      id: 'cotizacion',
      nombre: '2. Cálculo de una cotización',
      descripcion:
        'POST /api/quotes/estimate. El motor recorre los 42 insumos del inventario, empareja los colores del boceto en OKLab y reparte el área entintada entre las tintas. Es el punto con más cálculo del sistema.',
      niveles: NIVELES,
      peticiones: PETICIONES,
      hacer: (i) =>
        peticion('POST', '/api/quotes/estimate', {
          token,
          json: {
            widthCm: 10 + (i % 15),
            heightCm: 12 + (i % 10),
            sketchId: ctx.sketchId,
            stroke: 'medio',
          },
        }),
    })
  );

  escenarios.push(
    await rampa({
      id: 'agendado',
      nombre: '3. Agendado de citas',
      descripcion:
        'POST /api/sessions en horas distintas. Cada escritura toma el bloqueo por artista, revisa que la hora esté libre y escribe, todo en una transacción.',
      niveles: NIVELES,
      peticiones: PETICIONES,
      preparar: async () => {
        // Cada nivel agenda en su propio tramo de días para no chocar con el anterior.
        estado.diaBase = (estado.diaBase ?? 200) + 400;
      },
      hacer: (i) =>
        peticion('POST', '/api/sessions', {
          token,
          json: {
            projectId: ctx.projectId,
            startsAt: enDias(estado.diaBase + Math.floor(i / 10), 8 + (i % 10)),
            durationMinutes: 30,
            price: 40000,
          },
        }),
    })
  );

  escenarios.push(
    await rampa({
      id: 'subida',
      nombre: '4. Subida de un boceto',
      descripcion:
        'POST /api/sketches con una imagen PNG de 45 kB. Incluye la optimización con sharp, la medición de la cobertura de tinta y de la paleta de colores, y el guardado del archivo.',
      niveles: NIVELES_SUBIDA,
      peticiones: PETICIONES_SUBIDA,
      hacer: async () => {
        const form = new FormData();
        form.append('image', new Blob([imagen], { type: 'image/png' }), 'carga.png');
        form.append('title', 'Boceto de carga');
        const r = await peticion('POST', '/api/sketches', { token, form });
        if (r.status === 201) estado.creados.sketches.push(r.body.sketch.id);
        return r;
      },
    })
  );

  // 5. Colisión: todas las peticiones piden la misma hora a la vez.
  process.stdout.write('\n5. Colisión en la misma hora\n');
  const hora = enDias(900, 15);
  const inicioColision = performance.now();
  const intentos = await Promise.all(
    Array.from({ length: COLISIONES }, () =>
      peticion('POST', '/api/sessions', {
        token,
        json: { projectId: ctx.projectId, startsAt: hora, durationMinutes: 120, price: 90000 },
      })
    )
  );
  const duracionColision = performance.now() - inicioColision;
  const colision = {
    intentos: COLISIONES,
    creadas: intentos.filter((r) => r.status === 201).length,
    rechazadas: intentos.filter((r) => r.status === 409).length,
    otros: intentos.filter((r) => r.status !== 201 && r.status !== 409).length,
    duracionMs: Math.round(duracionColision),
    latencia: resumir(intentos, duracionColision).latencia,
  };
  process.stdout.write(
    `  ${COLISIONES} peticiones simultáneas → ${colision.creadas} cita creada, ` +
      `${colision.rechazadas} rechazadas con 409, ${colision.otros} otros ` +
      `(${colision.duracionMs} ms)\n`
  );

  const resultados = {
    fecha: new Date().toISOString(),
    base: BASE,
    entorno: {
      generador: `Node.js ${process.version} sobre ${os.type()} ${os.release()}`,
      cpu: os.cpus()[0]?.model?.trim(),
      nucleos: os.cpus().length,
      memoriaGB: Math.round(os.totalmem() / 1024 ** 3),
      servidor: 'Backend y PostgreSQL en contenedores Docker, en la misma máquina',
    },
    escenarios,
    colision,
  };

  fs.mkdirSync(path.dirname(SALIDA), { recursive: true });
  fs.writeFileSync(SALIDA, JSON.stringify(resultados, null, 2));
  process.stdout.write(`\nResultados en ${SALIDA}\n`);

  process.stdout.write('Limpiando lo que creó la corrida...\n');
  await limpiar(ctx);
  process.stdout.write(`Listo. Queda solo la cuenta ${ctx.correo}, sin datos.\n`);
  process.stdout.write(
    'Para borrar también esas cuentas, en el contenedor de PostgreSQL:\n' +
      "  DELETE FROM users WHERE email LIKE 'carga-%@pruebas.local';\n" +
      "  DELETE FROM studios WHERE email LIKE 'carga-%@pruebas.local';\n"
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
