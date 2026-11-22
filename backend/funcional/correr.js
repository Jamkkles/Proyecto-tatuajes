/**
 * Pruebas funcionales de caja negra contra el sistema en ejecución: los 35
 * casos (CP-01 a CP-35) del capítulo 5 de la memoria.
 *
 *   ADMIN_EMAIL=… ADMIN_PASSWORD=… node backend/funcional/correr.js
 *   node backend/funcional/tablas.js
 *
 * Cada caso entra por la API, igual que lo hace la aplicación, y compara la
 * salida con lo esperado. No consulta la base directamente. Va contra el
 * backend local (Docker), nunca contra producción: crea cuentas y un estudio.
 *
 * CP-34 y CP-35 necesitan una cuenta de administrador (ADMIN_EMAIL y
 * ADMIN_PASSWORD); sin ellas esos dos casos fallan y los otros 33 corren igual.
 *
 * Deja el detalle en docs/pruebas-funcionales/casos.json. Las cuentas que crea
 * (cp-…@pruebas.local) quedan en la base; al final imprime el DELETE que las
 * borra.
 */
const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE ?? 'http://localhost:3000';
const SELLO = Date.now().toString(36);
const IMAGEN = path.join(__dirname, '..', '..', 'frontend', 'public', 'logo.png');
const SALIDA = path.join(__dirname, '..', '..', 'docs', 'pruebas-funcionales', 'casos.json');

// Crea cuentas, un estudio y desactiva una cuenta: contra la nube dejaría basura
// en la base real y, con el registro abierto, cuentas que cualquiera vería.
const LOCALES = new Set(['localhost', '127.0.0.1', '[::1]']);
if (!LOCALES.has(new URL(BASE).hostname)) {
  console.error(`BASE apunta a ${BASE}. Estas pruebas solo corren contra el backend local.`);
  process.exit(1);
}

const casos = [];
const estado = {};

async function req(metodo, ruta, { token, json, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let body;
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  } else if (form) {
    body = form;
  }
  const r = await fetch(`${BASE}${ruta}`, { method: metodo, headers, body });
  const texto = await r.text();
  let cuerpo;
  try {
    cuerpo = texto ? JSON.parse(texto) : null;
  } catch {
    cuerpo = texto;
  }
  return { status: r.status, body: cuerpo };
}

function imagenForm(campos = {}) {
  const form = new FormData();
  const buf = fs.readFileSync(IMAGEN);
  form.append('image', new Blob([buf], { type: 'image/png' }), 'boceto.png');
  for (const [k, v] of Object.entries(campos)) form.append(k, String(v));
  return form;
}

async function caso(id, modulo, hu, descripcion, entrada, esperado, fn) {
  let obtenido;
  let ok = false;
  try {
    const r = await fn();
    ok = r.ok;
    obtenido = r.obtenido;
  } catch (err) {
    obtenido = `error: ${err.message}`;
  }
  casos.push({ id, modulo, hu, descripcion, entrada, esperado, obtenido, ok });
  console.log(`${ok ? 'OK  ' : 'FALLA'} ${id}  ${descripcion}  →  ${obtenido}`);
}

const fecha = (dias, hora) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + dias);
  d.setUTCHours(hora, 0, 0, 0);
  return d.toISOString();
};

async function main() {
  const correoA = `cp-${SELLO}-a@pruebas.local`;
  const correoB = `cp-${SELLO}-b@pruebas.local`;
  const clave = 'pruebas-funcionales-2026';

  // ---------------------------------------------------------------- AUTENTICACIÓN
  await caso(
    'CP-01', 'Autenticación', 'HU01',
    'Registrar una cuenta nueva',
    'Nombre, correo sin usar y contraseña',
    '201 con token y datos del usuario',
    async () => {
      const r = await req('POST', '/api/auth/register', {
        json: { name: 'Artista de prueba', email: correoA, password: clave },
      });
      estado.tokenA = r.body?.token;
      estado.userA = r.body?.user;
      return {
        ok: r.status === 201 && !!r.body?.token && r.body?.user?.email === correoA,
        obtenido: `${r.status}, token emitido para ${r.body?.user?.email ?? '—'}`,
      };
    }
  );

  await caso(
    'CP-02', 'Autenticación', 'HU01',
    'Registrar con un correo ya usado',
    'El mismo correo del CP-01',
    '409 y ninguna cuenta nueva',
    async () => {
      const r = await req('POST', '/api/auth/register', {
        json: { name: 'Repetido', email: correoA, password: clave },
      });
      return { ok: r.status === 409, obtenido: `${r.status} ${r.body?.message ?? ''}`.trim() };
    }
  );

  await caso(
    'CP-03', 'Autenticación', 'HU02',
    'Iniciar sesión con credenciales válidas',
    'Correo y contraseña correctos',
    '200 con token y rol del usuario',
    async () => {
      const r = await req('POST', '/api/auth/login', { json: { email: correoA, password: clave } });
      estado.tokenA = r.body?.token ?? estado.tokenA;
      return {
        ok: r.status === 200 && !!r.body?.token && r.body?.user?.role === 'tatuador',
        obtenido: `${r.status}, rol ${r.body?.user?.role ?? '—'}`,
      };
    }
  );

  await caso(
    'CP-04', 'Autenticación', 'HU02',
    'Iniciar sesión con contraseña incorrecta',
    'Correo válido y contraseña errónea',
    '401 sin token',
    async () => {
      const r = await req('POST', '/api/auth/login', { json: { email: correoA, password: 'noesesta' } });
      return { ok: r.status === 401 && !r.body?.token, obtenido: `${r.status} sin token` };
    }
  );

  await caso(
    'CP-05', 'Autenticación', 'HU02',
    'Entrar a un recurso privado sin sesión',
    'GET de la galería sin cabecera de autorización',
    '401 y ningún dato',
    async () => {
      const r = await req('GET', '/api/sketches');
      return { ok: r.status === 401 && !r.body?.sketches, obtenido: `${r.status} sin datos` };
    }
  );

  // Segunda cuenta, para las pruebas de propiedad de los datos.
  const regB = await req('POST', '/api/auth/register', {
    json: { name: 'Otro artista', email: correoB, password: clave },
  });
  estado.tokenB = regB.body?.token;
  estado.userB = regB.body?.user;

  // ---------------------------------------------------------------- BOCETOS
  await caso(
    'CP-06', 'Bocetos', 'HU04',
    'Subir un boceto con su imagen',
    'Archivo PNG, título y etiquetas',
    '201, el boceto queda con enlace y cobertura de tinta medida',
    async () => {
      const r = await req('POST', '/api/sketches', {
        token: estado.tokenA,
        form: imagenForm({ title: 'Boceto de prueba', tags: 'prueba,funcional', status: 'disponible' }),
      });
      estado.sketchId = r.body?.sketch?.id;
      const ratio = Number(r.body?.sketch?.ink_ratio);
      return {
        ok: r.status === 201 && !!r.body?.sketch?.url && ratio > 0 && ratio <= 1,
        obtenido: `${r.status}, cobertura ${(ratio * 100).toFixed(1)} %`,
      };
    }
  );

  await caso(
    'CP-07', 'Bocetos', 'HU04',
    'Subir un boceto sin título',
    'Archivo PNG y título vacío',
    '400 y el boceto no se guarda',
    async () => {
      const r = await req('POST', '/api/sketches', {
        token: estado.tokenA,
        form: imagenForm({ title: '' }),
      });
      return { ok: r.status === 400, obtenido: `${r.status} ${r.body?.message ?? ''}`.trim() };
    }
  );

  await caso(
    'CP-08', 'Bocetos', 'HU06',
    'Filtrar la galería por etiqueta',
    'Consulta con la etiqueta «funcional»',
    'Solo los bocetos que la tienen',
    async () => {
      const r = await req('GET', '/api/sketches?tag=funcional', { token: estado.tokenA });
      const lista = r.body?.sketches ?? [];
      return {
        ok: r.status === 200 && lista.length === 1 && lista[0].id === estado.sketchId,
        obtenido: `${r.status}, ${lista.length} boceto(s)`,
      };
    }
  );

  await caso(
    'CP-09', 'Bocetos', 'HU05',
    'Editar los datos de un boceto',
    'Nuevo título y zona del cuerpo',
    '200 con los datos actualizados',
    async () => {
      const r = await req('PATCH', `/api/sketches/${estado.sketchId}`, {
        token: estado.tokenA,
        json: { title: 'Boceto editado', bodyZone: 'antebrazo' },
      });
      return {
        ok: r.status === 200 && r.body?.sketch?.title === 'Boceto editado',
        obtenido: `${r.status}, título «${r.body?.sketch?.title ?? '—'}»`,
      };
    }
  );

  await caso(
    'CP-10', 'Bocetos', 'HU06',
    'Editar el boceto de otro artista',
    'La segunda cuenta edita el boceto de la primera',
    '404, sin revelar que existe',
    async () => {
      const r = await req('PATCH', `/api/sketches/${estado.sketchId}`, {
        token: estado.tokenB,
        json: { title: 'Intento ajeno' },
      });
      return { ok: r.status === 404, obtenido: `${r.status}, sin cambios` };
    }
  );

  // ---------------------------------------------------------------- PREVISUALIZACIÓN
  await caso(
    'CP-11', 'Previsualización', 'HU09',
    'Guardar una escena 3D con el boceto colocado',
    'Modelo, cámara y una calca con tamaño y posición',
    '201 y la escena conserva la calca',
    async () => {
      const r = await req('POST', '/api/previews', {
        token: estado.tokenA,
        json: {
          name: 'Escena de prueba',
          modelId: 'brazo',
          camera: { position: [0, 1.4, 1.2], target: [0, 1.2, 0] },
          placements: [
            {
              sketchId: estado.sketchId,
              position: [0.1, 1.1, 0.05],
              quaternion: [0, 0, 0, 1],
              size: [0.08, 0.1, 0.08],
            },
          ],
        },
      });
      estado.previewId = r.body?.preview?.id;
      const colocadas = r.body?.preview?.placements?.length ?? 0;
      return { ok: r.status === 201 && colocadas === 1, obtenido: `${r.status}, ${colocadas} calca(s)` };
    }
  );

  await caso(
    'CP-12', 'Previsualización', 'HU09',
    'Guardar una escena con el boceto de otro artista',
    'La segunda cuenta usa el boceto de la primera',
    '400, la referencia ajena se rechaza',
    async () => {
      const r = await req('POST', '/api/previews', {
        token: estado.tokenB,
        json: {
          name: 'Escena ajena',
          modelId: 'brazo',
          placements: [
            {
              sketchId: estado.sketchId,
              position: [0, 1, 0],
              quaternion: [0, 0, 0, 1],
              size: [0.05, 0.05, 0.05],
            },
          ],
        },
      });
      const msg = r.body?.message ?? '';
      return { ok: r.status === 400 && /boceto/i.test(msg), obtenido: `${r.status} ${msg}`.trim() };
    }
  );

  // ---------------------------------------------------------------- INVENTARIO
  await caso(
    'CP-13', 'Inventario', 'HU11',
    'Entrar por primera vez al inventario',
    'Cuenta recién creada, sin insumos',
    'Se cargan los 42 insumos del kit inicial',
    async () => {
      const r = await req('GET', '/api/materials', { token: estado.tokenA });
      const lista = r.body?.materials ?? [];
      estado.insumos = lista;
      return { ok: r.status === 200 && lista.length === 42, obtenido: `${r.status}, ${lista.length} insumos` };
    }
  );

  await caso(
    'CP-14', 'Inventario', 'HU11',
    'Registrar un insumo nuevo',
    'Nombre, categoría, unidad, stock, nivel crítico y costo',
    '201 con el insumo creado',
    async () => {
      const r = await req('POST', '/api/materials', {
        token: estado.tokenA,
        json: {
          name: 'Tinta de prueba',
          category: 'tintas',
          unit: 'ml',
          quantity: 4,
          minQuantity: 5,
          unitCost: 600,
          consumptionBasis: 'area',
          consumptionRate: 0.05,
          colorHex: '#111111',
        },
      });
      estado.materialId = r.body?.material?.id;
      return { ok: r.status === 201 && !!estado.materialId, obtenido: `${r.status}, insumo creado` };
    }
  );

  await caso(
    'CP-15', 'Inventario', 'HU12',
    'Descontar más stock del que hay',
    'Insumo con 4 unidades y un ajuste de −10',
    'El stock queda en 0, nunca negativo',
    async () => {
      const r = await req('POST', `/api/materials/${estado.materialId}/stock`, {
        token: estado.tokenA,
        json: { delta: -10 },
      });
      const q = Number(r.body?.material?.quantity);
      return { ok: r.status === 200 && q === 0, obtenido: `${r.status}, stock ${q}` };
    }
  );

  await caso(
    'CP-16', 'Inventario', 'HU13',
    'Listar los insumos en nivel crítico',
    'Consulta con el filtro de stock bajo',
    'Aparece el insumo cuyo stock llegó a 0',
    async () => {
      const r = await req('GET', '/api/materials?low=true', { token: estado.tokenA });
      const lista = r.body?.materials ?? [];
      return {
        ok: r.status === 200 && lista.some((m) => m.id === estado.materialId),
        obtenido: `${r.status}, ${lista.length} en nivel crítico`,
      };
    }
  );

  // ---------------------------------------------------------------- COTIZACIONES
  await caso(
    'CP-17', 'Cotizaciones', 'HU14',
    'Estimar el costo de un tatuaje',
    'Boceto medido, 12 × 15 cm, trazo medio',
    'Costo mayor que cero, con tiempo y sesiones calculados',
    async () => {
      const r = await req('POST', '/api/quotes/estimate', {
        token: estado.tokenA,
        json: { widthCm: 12, heightCm: 15, sketchId: estado.sketchId, stroke: 'medio' },
      });
      const e = r.body?.estimate;
      estado.estimacion = e;
      return {
        ok: r.status === 200 && e?.materialsCost > 0 && e?.estimatedMinutes > 0 && e?.sessionsCount >= 1,
        obtenido: `${r.status}, $${e?.materialsCost}, ${e?.estimatedMinutes} min, ${e?.sessionsCount} sesión(es)`,
      };
    }
  );

  await caso(
    'CP-18', 'Cotizaciones', 'HU15',
    'Guardar la cotización',
    'La estimación anterior con un título',
    '201 con el detalle por insumo',
    async () => {
      const r = await req('POST', '/api/quotes', {
        token: estado.tokenA,
        json: { title: 'Cotización de prueba', widthCm: 12, heightCm: 15, sketchId: estado.sketchId },
      });
      estado.quoteId = r.body?.quote?.id;
      estado.quoteItems = r.body?.quote?.items ?? [];
      return {
        ok: r.status === 201 && estado.quoteItems.length > 0,
        obtenido: `${r.status}, ${estado.quoteItems.length} líneas de insumo`,
      };
    }
  );

  await caso(
    'CP-19', 'Cotizaciones', 'HU16',
    'Descontar del inventario lo cotizado',
    'La cotización guardada',
    'El stock de los insumos baja según el detalle',
    async () => {
      const conMaterial = estado.quoteItems.find((i) => i.material_id);
      const antes = (await req('GET', '/api/materials', { token: estado.tokenA })).body.materials.find(
        (m) => m.id === conMaterial.material_id
      );
      const r = await req('POST', `/api/quotes/${estado.quoteId}/consume`, { token: estado.tokenA });
      const despues = (await req('GET', '/api/materials', { token: estado.tokenA })).body.materials.find(
        (m) => m.id === conMaterial.material_id
      );
      return {
        ok: r.status === 200 && Number(despues.quantity) < Number(antes.quantity),
        obtenido: `${r.status}, «${antes.name}» de ${antes.quantity} a ${despues.quantity}`,
      };
    }
  );

  await caso(
    'CP-20', 'Cotizaciones', 'HU16',
    'Descontar dos veces la misma cotización',
    'La cotización ya consumida',
    '409, el inventario no se descuenta de nuevo',
    async () => {
      const r = await req('POST', `/api/quotes/${estado.quoteId}/consume`, { token: estado.tokenA });
      return { ok: r.status === 409, obtenido: `${r.status} ${r.body?.message ?? ''}`.trim() };
    }
  );

  // ---------------------------------------------------------------- AGENDA
  await caso(
    'CP-21', 'Agenda', 'HU20',
    'Crear una ficha de cliente',
    'Nombre y teléfono chileno',
    '201 con el cliente creado',
    async () => {
      const r = await req('POST', '/api/clients', {
        token: estado.tokenA,
        json: { name: 'Cliente de prueba', phone: '+56912345678' },
      });
      estado.clientId = r.body?.client?.id;
      return { ok: r.status === 201 && !!estado.clientId, obtenido: `${r.status}, cliente creado` };
    }
  );

  await caso(
    'CP-22', 'Agenda', 'HU19',
    'Crear un proyecto del cliente',
    'Cliente, nombre del proyecto y precio total',
    '201 con el proyecto enlazado al cliente',
    async () => {
      const r = await req('POST', '/api/projects', {
        token: estado.tokenA,
        json: { clientId: estado.clientId, title: 'Proyecto de prueba', totalPrice: 180000, sketchId: estado.sketchId },
      });
      estado.projectId = r.body?.project?.id;
      return { ok: r.status === 201 && !!estado.projectId, obtenido: `${r.status}, proyecto creado` };
    }
  );

  await caso(
    'CP-23', 'Agenda', 'HU17',
    'Agendar una cita',
    'Proyecto, fecha futura, 120 minutos y monto',
    '201 con la cita agendada',
    async () => {
      estado.hora1 = fecha(7, 13);
      const r = await req('POST', '/api/sessions', {
        token: estado.tokenA,
        json: { projectId: estado.projectId, startsAt: estado.hora1, durationMinutes: 120, price: 90000 },
      });
      estado.sessionId = r.body?.session?.id;
      return { ok: r.status === 201 && !!estado.sessionId, obtenido: `${r.status}, cita agendada` };
    }
  );

  await caso(
    'CP-24', 'Agenda', 'HU17',
    'Agendar una cita que se solapa con otra',
    'Una hora que cae dentro de la cita anterior',
    '409 nombrando con quién y a qué hora choca',
    async () => {
      const r = await req('POST', '/api/sessions', {
        token: estado.tokenA,
        json: { projectId: estado.projectId, startsAt: fecha(7, 14), durationMinutes: 60, price: 40000 },
      });
      const msg = r.body?.message ?? '';
      return {
        ok: r.status === 409 && msg.includes('Cliente de prueba'),
        obtenido: `${r.status} ${msg}`.trim(),
      };
    }
  );

  await caso(
    'CP-25', 'Agenda', 'HU17',
    'Agendar una cita contigua a otra',
    'Comienza justo cuando termina la anterior',
    '201, las citas seguidas no se consideran choque',
    async () => {
      const r = await req('POST', '/api/sessions', {
        token: estado.tokenA,
        json: { projectId: estado.projectId, startsAt: fecha(7, 15), durationMinutes: 60, price: 40000 },
      });
      estado.sessionContigua = r.body?.session?.id;
      return { ok: r.status === 201, obtenido: `${r.status}, cita agendada` };
    }
  );

  await caso(
    'CP-26', 'Agenda', 'HU21',
    'Cancelar una cita libera su horario',
    'Se cancela la contigua y se agenda otra a esa hora',
    '201, la hora vuelve a estar disponible',
    async () => {
      await req('PATCH', `/api/sessions/${estado.sessionContigua}`, {
        token: estado.tokenA,
        json: { status: 'cancelada' },
      });
      const r = await req('POST', '/api/sessions', {
        token: estado.tokenA,
        json: { projectId: estado.projectId, startsAt: fecha(7, 15), durationMinutes: 60, price: 40000 },
      });
      estado.sessionReemplazo = r.body?.session?.id;
      return { ok: r.status === 201, obtenido: `${r.status}, hora reutilizada` };
    }
  );

  await caso(
    'CP-27', 'Agenda', 'HU30',
    'Calificar una sesión con un valor fuera de rango',
    'Puntaje 6 en una escala de 1 a 5',
    '400 y la calificación no se guarda',
    async () => {
      const r = await req('PATCH', `/api/sessions/${estado.sessionId}`, {
        token: estado.tokenA,
        json: { rating: 6 },
      });
      return { ok: r.status === 400, obtenido: `${r.status} ${r.body?.message ?? ''}`.trim() };
    }
  );

  await caso(
    'CP-28', 'Agenda', 'HU30',
    'Calificar una sesión completada',
    'La sesión se marca completada y se califica con 4',
    'El cliente queda con promedio 4,0 sobre una sesión calificada',
    async () => {
      await req('PATCH', `/api/sessions/${estado.sessionId}`, {
        token: estado.tokenA,
        json: { status: 'completada' },
      });
      await req('PATCH', `/api/sessions/${estado.sessionId}`, { token: estado.tokenA, json: { rating: 4 } });
      const r = await req('GET', '/api/clients', { token: estado.tokenA });
      const c = (r.body?.clients ?? []).find((x) => x.id === estado.clientId);
      return {
        ok: Number(c?.rating_avg) === 4 && Number(c?.rating_count) === 1,
        obtenido: `promedio ${c?.rating_avg} sobre ${c?.rating_count} sesión(es)`,
      };
    }
  );

  await caso(
    'CP-29', 'Agenda', 'HU24',
    'Marcar una sesión como pagada',
    'La sesión completada de $90.000 se marca pagada',
    'Queda sellada la fecha de pago y el monto entra en lo cobrado del mes',
    async () => {
      const p = await req('PATCH', `/api/sessions/${estado.sessionId}`, {
        token: estado.tokenA,
        json: { paid: true },
      });
      const sellada = !!p.body?.session?.paid_at;
      const desde = new Date();
      desde.setUTCDate(desde.getUTCDate() - 1);
      const hasta = new Date();
      hasta.setUTCDate(hasta.getUTCDate() + 30);
      const r = await req(
        'GET',
        `/api/sessions/income?from=${desde.toISOString()}&to=${hasta.toISOString()}`,
        { token: estado.tokenA }
      );
      return {
        ok: sellada && Number(r.body?.collected) >= 90000,
        obtenido: `fecha de pago sellada, cobrado $${r.body?.collected}`,
      };
    }
  );

  await caso(
    'CP-30', 'Agenda', 'HU18',
    'Subir una foto del avance',
    'Imagen y descripción sobre la sesión',
    '201 y la foto queda asociada a la sesión',
    async () => {
      const r = await req('POST', `/api/sessions/${estado.sessionId}/photos`, {
        token: estado.tokenA,
        form: imagenForm({ caption: 'Avance de prueba' }),
      });
      return { ok: r.status === 201 && !!r.body?.photo?.url, obtenido: `${r.status}, foto guardada` };
    }
  );

  // ---------------------------------------------------------------- AVISOS
  await caso(
    'CP-31', 'Avisos', 'HU23',
    'Cambiar la hora de una cita futura',
    'La cita de reemplazo se mueve a otro día',
    'La respuesta trae el aviso de reagendamiento para el cliente',
    async () => {
      const r = await req('PATCH', `/api/sessions/${estado.sessionReemplazo}`, {
        token: estado.tokenA,
        json: { startsAt: fecha(9, 16) },
      });
      return {
        ok: r.status === 200 && r.body?.notice?.kind === 'reagendamiento',
        obtenido: `${r.status}, aviso «${r.body?.notice?.kind ?? 'ninguno'}»`,
      };
    }
  );

  await caso(
    'CP-32', 'Avisos', 'HU28',
    'Editar el texto de los mensajes al cliente',
    'Nota del recordatorio y cuidados posteriores',
    'Los textos quedan guardados y se leen igual',
    async () => {
      const nota = 'Llega 10 minutos antes, por favor.';
      await req('PUT', '/api/notification-settings', {
        token: estado.tokenA,
        json: { reminderNote: nota, aftercareNote: 'Lava con jabón neutro.' },
      });
      const r = await req('GET', '/api/notification-settings', { token: estado.tokenA });
      return {
        ok: r.status === 200 && r.body?.settings?.reminderNote === nota,
        obtenido: `${r.status}, nota guardada`,
      };
    }
  );

  // ---------------------------------------------------------------- ADMINISTRACIÓN
  await caso(
    'CP-33', 'Administración', 'HU31',
    'Entrar a la administración sin ser administrador',
    'Un tatuador pide el listado de estudios',
    '403, la ruta es solo del administrador',
    async () => {
      const r = await req('GET', '/api/admin/studios', { token: estado.tokenA });
      return { ok: r.status === 403, obtenido: `${r.status}` };
    }
  );

  if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
    console.log('  (sin ADMIN_EMAIL y ADMIN_PASSWORD: CP-34 y CP-35 van a fallar por falta de credenciales)');
  }
  const adminLogin = await req('POST', '/api/auth/login', {
    json: { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD },
  });
  estado.tokenAdmin = adminLogin.body?.token;

  await caso(
    'CP-34', 'Administración', 'HU31',
    'Registrar un estudio con su primer tatuador',
    'Nombre del estudio, plan y datos del dueño',
    '201 con el estudio, la cuenta y una contraseña temporal',
    async () => {
      const r = await req('POST', '/api/admin/studios', {
        token: estado.tokenAdmin,
        json: {
          name: `Estudio de prueba ${SELLO}`,
          email: `estudio-${SELLO}@pruebas.local`,
          plan: 'basico',
          ownerName: 'Dueño de prueba',
          ownerEmail: `duenio-${SELLO}@pruebas.local`,
        },
      });
      estado.studioId = r.body?.studio?.id;
      const ok = r.status === 201 && !!r.body?.temporaryPassword && !!r.body?.user?.id;
      return {
        ok,
        obtenido: ok
          ? `${r.status}, estudio y cuenta creados con contraseña temporal`
          : `${r.status} ${r.body?.message ?? ''}`.trim(),
      };
    }
  );

  await caso(
    'CP-35', 'Administración', 'HU34',
    'Desactivar una cuenta',
    'El administrador desactiva al segundo artista',
    'Su siguiente petición es rechazada con 401 y el motivo',
    async () => {
      const d = await req('PATCH', `/api/admin/users/${estado.userB.id}`, {
        token: estado.tokenAdmin,
        json: { active: false },
      });
      const r = await req('GET', '/api/sketches', { token: estado.tokenB });
      return {
        ok: d.status === 200 && r.status === 401 && r.body?.code === 'user_inactive',
        obtenido: `${r.status} con código «${r.body?.code ?? '—'}»`,
      };
    }
  );

  // ---------------------------------------------------------------- resumen
  const ok = casos.filter((c) => c.ok).length;
  console.log(`\n${ok} de ${casos.length} casos conformes (${((ok / casos.length) * 100).toFixed(1)} %)`);
  fs.mkdirSync(path.dirname(SALIDA), { recursive: true });
  fs.writeFileSync(SALIDA, JSON.stringify({ fecha: new Date().toISOString(), casos }, null, 2));
  console.log(`Detalle en ${path.relative(process.cwd(), SALIDA)}`);
  console.log(
    '\nLas cuentas de esta corrida quedan en la base. Para borrarlas:\n' +
      "  DELETE FROM users WHERE email LIKE 'cp-%@pruebas.local' OR email LIKE 'duenio-%@pruebas.local';\n" +
      "  DELETE FROM studios WHERE email LIKE 'cp-%@pruebas.local' OR email LIKE 'estudio-%@pruebas.local';"
  );
  if (ok !== casos.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
