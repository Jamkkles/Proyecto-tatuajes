/**
 * Avisos al artista, mensajes al cliente y configuración, contra la base real.
 *
 * Lo que aquí se comprueba de verdad son las restricciones de unicidad: son
 * ellas —y no el código de la aplicación— las que impiden avisar dos veces del
 * mismo insumo o escribirle dos veces al mismo cliente.
 */
const pool = require('../../src/config/db');
const notificationModel = require('../../src/models/notificationModel');
const settingsModel = require('../../src/models/notificationSettingsModel');
const messageLogModel = require('../../src/models/messageLogModel');
const reminderModel = require('../../src/models/reminderModel');
const pushModel = require('../../src/models/pushSubscriptionModel');
const whatsappAuthModel = require('../../src/models/whatsappAuthModel');
const { crearArtista, crearCliente, crearProyecto, crearSesion, enDias } = require('./datos');

/** Una cita que ya cumple la condición de «creada hace más de una hora». */
async function citaAntigua(artista, horasFaltantes) {
  const cliente = await crearCliente(artista.id, { name: 'Ana', phone: '+56911112222' });
  const proyecto = await crearProyecto(artista.id, cliente.id);
  const sesion = await crearSesion(artista.id, proyecto.id, {
    startsAt: new Date(Date.now() + horasFaltantes * 3600_000).toISOString(),
  });
  await pool.query(
    "UPDATE project_sessions SET created_at = now() - interval '2 hours' WHERE id = $1",
    [sesion.id]
  );
  return sesion;
}

describe('notificationModel', () => {
  test('guarda el aviso con sus datos y lo cuenta como no leído', async () => {
    const artista = await crearArtista();
    const aviso = await notificationModel.create({
      userId: artista.id,
      kind: 'stock_bajo',
      title: 'Queda poca tinta',
      body: 'Tinta negra: 2 ml',
      url: '/inventario',
      data: { materialId: 'abc' },
    });

    expect(aviso.title).toBe('Queda poca tinta');
    expect(aviso.data).toEqual({ materialId: 'abc' });
    expect(aviso.read_at).toBeNull();

    const { notifications, unread } = await notificationModel.listByUser(artista.id);
    expect(notifications).toHaveLength(1);
    expect(unread).toBe(1);
  });

  test('la misma clave de deduplicación no avisa dos veces', async () => {
    const artista = await crearArtista();
    const datos = { userId: artista.id, kind: 'stock_bajo', title: 'Poca tinta', dedupeKey: 'tinta:hoy' };

    expect(await notificationModel.create(datos)).not.toBeNull();
    expect(await notificationModel.create(datos)).toBeNull();

    const { notifications } = await notificationModel.listByUser(artista.id);
    expect(notifications).toHaveLength(1);
  });

  test('sin clave de deduplicación cada aviso entra', async () => {
    const artista = await crearArtista();
    await notificationModel.create({ userId: artista.id, kind: 'cita', title: 'Una' });
    await notificationModel.create({ userId: artista.id, kind: 'cita', title: 'Otra' });

    const { unread } = await notificationModel.listByUser(artista.id);
    expect(unread).toBe(2);
  });

  test('la misma clave en otra cuenta sí avisa', async () => {
    const uno = await crearArtista();
    const otro = await crearArtista();
    const datos = { kind: 'stock_bajo', title: 'Poca tinta', dedupeKey: 'tinta:hoy' };

    expect(await notificationModel.create({ ...datos, userId: uno.id })).not.toBeNull();
    expect(await notificationModel.create({ ...datos, userId: otro.id })).not.toBeNull();
  });

  test('marcar leído respeta al dueño y no cuenta dos veces', async () => {
    const artista = await crearArtista();
    const otro = await crearArtista();
    const mio = await notificationModel.create({ userId: artista.id, kind: 'cita', title: 'Mío' });
    const ajeno = await notificationModel.create({ userId: otro.id, kind: 'cita', title: 'Ajeno' });

    expect(await notificationModel.markRead(artista.id, { ids: [ajeno.id] })).toBe(0);
    expect(await notificationModel.markRead(artista.id, { ids: [mio.id] })).toBe(1);
    expect(await notificationModel.markRead(artista.id, { ids: [mio.id] })).toBe(0);
    expect(await notificationModel.markRead(artista.id, { ids: [] })).toBe(0);

    expect((await notificationModel.listByUser(artista.id)).unread).toBe(0);
    expect((await notificationModel.listByUser(otro.id)).unread).toBe(1);
  });

  test('marcar todos como leídos deja la campanita en cero', async () => {
    const artista = await crearArtista();
    await notificationModel.create({ userId: artista.id, kind: 'cita', title: 'Una' });
    await notificationModel.create({ userId: artista.id, kind: 'cita', title: 'Otra' });

    expect(await notificationModel.markRead(artista.id, { all: true })).toBe(2);
    expect((await notificationModel.listByUser(artista.id)).unread).toBe(0);
  });

  test('el listado respeta el límite y el orden', async () => {
    const artista = await crearArtista();
    for (const titulo of ['Primero', 'Segundo', 'Tercero']) {
      await notificationModel.create({ userId: artista.id, kind: 'cita', title: titulo });
    }

    const { notifications } = await notificationModel.listByUser(artista.id, { limit: 2 });
    expect(notifications.map((n) => n.title)).toEqual(['Tercero', 'Segundo']);
  });
});

describe('notificationSettingsModel', () => {
  test('quien nunca tocó la configuración recibe los valores por defecto', async () => {
    const artista = await crearArtista();
    expect(await settingsModel.get(artista.id)).toEqual(settingsModel.DEFAULT_SETTINGS);
  });

  test('guarda solo lo que viene y conserva el resto', async () => {
    const artista = await crearArtista();

    const primero = await settingsModel.save(artista.id, { remindersEnabled: false });
    expect(primero.remindersEnabled).toBe(false);
    expect(primero.aftercareNote).toBe(settingsModel.DEFAULT_SETTINGS.aftercareNote);

    const segundo = await settingsModel.save(artista.id, { reminderNote: 'Llega 10 minutos antes.' });
    expect(segundo.reminderNote).toBe('Llega 10 minutos antes.');
    expect(segundo.remindersEnabled).toBe(false);

    const sinCambios = await settingsModel.save(artista.id, {});
    expect(sinCambios).toEqual(segundo);
  });

  test('los valores por defecto del código son los mismos que los de la tabla', async () => {
    const artista = await crearArtista();
    // Se crea la fila sin tocar los campos: los valores los pone el DEFAULT de la tabla.
    await pool.query('INSERT INTO notification_settings (user_id) VALUES ($1)', [artista.id]);
    expect(await settingsModel.get(artista.id)).toEqual(settingsModel.DEFAULT_SETTINGS);
  });
});

describe('messageLogModel', () => {
  test('el envío se reclama una sola vez', async () => {
    const artista = await crearArtista();
    const sesion = await citaAntigua(artista, 20);
    const datos = {
      userId: artista.id,
      sessionId: sesion.id,
      kind: 'recordatorio',
      channel: 'whatsapp',
      toPhone: '56911112222',
      dedupeKey: `recordatorio:${sesion.id}:123`,
    };

    const primero = await messageLogModel.claim(datos);
    expect(primero).not.toBeNull();
    expect(await messageLogModel.claim(datos)).toBeNull();

    const { rows } = await pool.query('SELECT count(*)::int AS n FROM message_log');
    expect(rows[0].n).toBe(1);
  });

  test('diez corridas simultáneas reclaman un solo envío', async () => {
    const artista = await crearArtista();
    const sesion = await citaAntigua(artista, 20);
    const datos = {
      userId: artista.id,
      sessionId: sesion.id,
      kind: 'recordatorio',
      channel: 'whatsapp',
      dedupeKey: `recordatorio:${sesion.id}:999`,
    };

    const intentos = await Promise.all(Array.from({ length: 10 }, () => messageLogModel.claim(datos)));
    expect(intentos.filter(Boolean)).toHaveLength(1);
  });

  test('finish deja el estado y el error recortado', async () => {
    const artista = await crearArtista();
    const sesion = await citaAntigua(artista, 20);
    const reclamo = await messageLogModel.claim({
      userId: artista.id,
      sessionId: sesion.id,
      kind: 'cuidados',
      channel: 'whatsapp',
      dedupeKey: 'cuidados:1',
    });

    await messageLogModel.finish(reclamo.id, {
      status: 'error',
      channel: 'manual',
      error: 'x'.repeat(900),
    });

    const { rows } = await pool.query('SELECT status, channel, error FROM message_log WHERE id = $1', [
      reclamo.id,
    ]);
    expect(rows[0].status).toBe('error');
    expect(rows[0].channel).toBe('manual');
    expect(rows[0].error).toHaveLength(500);
  });

  test('countRecent cuenta solo los enviados del canal y de la última ventana', async () => {
    const artista = await crearArtista();
    const sesion = await citaAntigua(artista, 20);

    const enviar = async (clave, channel, status, minutosAtras = 0) => {
      const reclamo = await messageLogModel.claim({
        userId: artista.id,
        sessionId: sesion.id,
        kind: 'recordatorio',
        channel,
        dedupeKey: clave,
      });
      await messageLogModel.finish(reclamo.id, { status, channel });
      if (minutosAtras) {
        await pool.query(
          'UPDATE message_log SET created_at = now() - make_interval(mins => $2) WHERE id = $1',
          [reclamo.id, minutosAtras]
        );
      }
    };

    await enviar('a', 'whatsapp_web', 'enviado');
    await enviar('b', 'whatsapp_web', 'error');
    await enviar('c', 'manual', 'enviado');
    await enviar('d', 'whatsapp_web', 'enviado', 120);

    expect(await messageLogModel.countRecent(artista.id, 'whatsapp_web', 60)).toBe(1);
    expect(await messageLogModel.countRecent(artista.id, 'whatsapp_web', 180)).toBe(2);
  });
});

describe('reminderModel', () => {
  test('toma las citas a las que les faltan entre 1 y 24 horas', async () => {
    const artista = await crearArtista();
    const enVentana = await citaAntigua(artista, 20);
    await citaAntigua(artista, 0.5); // demasiado cerca
    await citaAntigua(artista, 40); // demasiado lejos

    const pendientes = await reminderModel.dueForReminder();
    expect(pendientes.map((p) => p.id)).toEqual([enVentana.id]);
    expect(pendientes[0]).toMatchObject({ client_name: 'Ana', client_phone: '+56911112222' });
    expect(pendientes[0].reminder_note).toBe(
      require('../../src/models/notificationSettingsModel').DEFAULT_SETTINGS.reminderNote
    );
  });

  test('no se le escribe al cliente que acaba de reservar', async () => {
    const artista = await crearArtista();
    const cliente = await crearCliente(artista.id, { phone: '+56911112222' });
    const proyecto = await crearProyecto(artista.id, cliente.id);
    await crearSesion(artista.id, proyecto.id, {
      startsAt: new Date(Date.now() + 20 * 3600_000).toISOString(),
    });

    expect(await reminderModel.dueForReminder()).toEqual([]);
  });

  test('el artista que apagó los recordatorios no genera ninguno', async () => {
    const artista = await crearArtista();
    await citaAntigua(artista, 20);
    await settingsModel.save(artista.id, { remindersEnabled: false });

    expect(await reminderModel.dueForReminder()).toEqual([]);
  });

  test('usa la nota que el artista escribió', async () => {
    const artista = await crearArtista();
    await citaAntigua(artista, 20);
    await settingsModel.save(artista.id, { reminderNote: 'Ven con el estómago lleno.' });

    const [pendiente] = await reminderModel.dueForReminder();
    expect(pendiente.reminder_note).toBe('Ven con el estómago lleno.');
  });

  test('la clave que arma el SQL es la misma que arma la aplicación', async () => {
    const artista = await crearArtista();
    const sesion = await citaAntigua(artista, 20);
    const [pendiente] = await reminderModel.dueForReminder();

    // Así la construye services/clientMessages.js.
    const clave = `recordatorio:${pendiente.id}:${Math.floor(new Date(pendiente.starts_at).getTime() / 1000)}`;
    await messageLogModel.claim({
      userId: artista.id,
      sessionId: sesion.id,
      kind: 'recordatorio',
      channel: 'whatsapp',
      dedupeKey: clave,
    });

    // Si las dos claves coinciden, la cita deja de aparecer: no se repite el mensaje.
    expect(await reminderModel.dueForReminder()).toEqual([]);
  });

  test('reagendar genera un recordatorio nuevo', async () => {
    const artista = await crearArtista();
    const sesion = await citaAntigua(artista, 20);
    const [antes] = await reminderModel.dueForReminder();
    await messageLogModel.claim({
      userId: artista.id,
      sessionId: sesion.id,
      kind: 'recordatorio',
      channel: 'whatsapp',
      dedupeKey: `recordatorio:${antes.id}:${Math.floor(new Date(antes.starts_at).getTime() / 1000)}`,
    });

    await pool.query(
      "UPDATE project_sessions SET starts_at = now() + interval '18 hours' WHERE id = $1",
      [sesion.id]
    );

    const despues = await reminderModel.dueForReminder();
    expect(despues.map((p) => p.id)).toEqual([sesion.id]);
  });

  test('una cita cancelada no genera recordatorio', async () => {
    const artista = await crearArtista();
    const sesion = await citaAntigua(artista, 20);
    await pool.query("UPDATE project_sessions SET status = 'cancelada' WHERE id = $1", [sesion.id]);

    expect(await reminderModel.dueForReminder()).toEqual([]);
  });
});

describe('pushSubscriptionModel', () => {
  const dispositivo = (extra = {}) => ({
    endpoint: 'https://push.example/abc',
    p256dh: 'clave-publica',
    auth: 'secreto',
    userAgent: 'iPhone',
    ...extra,
  });

  test('el mismo teléfono en otra cuenta cambia de dueño en vez de duplicarse', async () => {
    const uno = await crearArtista();
    const otro = await crearArtista();

    await pushModel.save({ userId: uno.id, ...dispositivo() });
    await pushModel.save({ userId: otro.id, ...dispositivo({ p256dh: 'otra-clave' }) });

    expect(await pushModel.listByUser(uno.id)).toEqual([]);
    const delOtro = await pushModel.listByUser(otro.id);
    expect(delOtro).toHaveLength(1);
    expect(delOtro[0].p256dh).toBe('otra-clave');
  });

  test('se borra por endpoint y por id', async () => {
    const artista = await crearArtista();
    await pushModel.save({ userId: artista.id, ...dispositivo() });
    const otro = await pushModel.save({ userId: artista.id, ...dispositivo({ endpoint: 'https://push.example/dos' }) });

    expect(await pushModel.removeByEndpoint(artista.id, 'https://push.example/abc')).toBe(1);
    expect(await pushModel.removeByEndpoint(artista.id, 'https://push.example/abc')).toBe(0);

    await pushModel.removeById(otro.id);
    expect(await pushModel.listByUser(artista.id)).toEqual([]);
  });
});

describe('whatsappAuthModel', () => {
  test('la sesión sella la fecha al vincularse y la borra al caerse', async () => {
    const artista = await crearArtista();

    await whatsappAuthModel.saveSession(artista.id, { status: 'vinculando' });
    expect(await whatsappAuthModel.getSession(artista.id)).toMatchObject({ status: 'vinculando', linked_at: null });

    await whatsappAuthModel.saveSession(artista.id, { status: 'vinculado', phone: '56911112222' });
    const vinculada = await whatsappAuthModel.getSession(artista.id);
    expect(vinculada.phone).toBe('56911112222');
    expect(vinculada.linked_at).not.toBeNull();

    // Reconectar conserva la fecha original del vínculo.
    await whatsappAuthModel.saveSession(artista.id, { status: 'vinculado' });
    const otraVez = await whatsappAuthModel.getSession(artista.id);
    expect(new Date(otraVez.linked_at).getTime()).toBe(new Date(vinculada.linked_at).getTime());

    await whatsappAuthModel.saveSession(artista.id, { status: 'vinculando' });
    expect((await whatsappAuthModel.getSession(artista.id)).linked_at).toBeNull();
  });

  test('guarda, lee y borra credenciales en lote', async () => {
    const artista = await crearArtista();

    await whatsappAuthModel.setValues(artista.id, [
      { type: 'creds', id: 'principal', value: 'cifrado-1' },
      { type: 'key', id: 'a', value: 'cifrado-a' },
      { type: 'key', id: 'b', value: 'cifrado-b' },
    ]);

    expect(await whatsappAuthModel.getValue(artista.id, 'creds', 'principal')).toBe('cifrado-1');
    expect(await whatsappAuthModel.getValue(artista.id, 'creds', 'no-existe')).toBeNull();

    const varios = await whatsappAuthModel.getValues(artista.id, 'key', ['a', 'b', 'c']);
    expect([...varios.keys()].sort()).toEqual(['a', 'b']);
    expect(await whatsappAuthModel.getValues(artista.id, 'key', [])).toEqual(new Map());

    // Guardar el mismo id lo reemplaza; null lo borra.
    await whatsappAuthModel.setValues(artista.id, [
      { type: 'key', id: 'a', value: 'cifrado-nuevo' },
      { type: 'key', id: 'b', value: null },
    ]);
    expect(await whatsappAuthModel.getValue(artista.id, 'key', 'a')).toBe('cifrado-nuevo');
    expect(await whatsappAuthModel.getValue(artista.id, 'key', 'b')).toBeNull();
  });

  test('desvincular borra la sesión y todas las credenciales', async () => {
    const artista = await crearArtista();
    await whatsappAuthModel.saveSession(artista.id, { status: 'vinculado', phone: '56911112222' });
    await whatsappAuthModel.setValues(artista.id, [{ type: 'creds', id: 'principal', value: 'cifrado' }]);

    await whatsappAuthModel.deleteAll(artista.id);

    expect(await whatsappAuthModel.getSession(artista.id)).toBeNull();
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM whatsapp_auth');
    expect(rows[0].n).toBe(0);
  });
});
