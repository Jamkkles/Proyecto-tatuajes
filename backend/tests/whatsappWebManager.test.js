const { createManager, WhatsAppWebError, settings, prettyCode, phoneOfJid } = require('../src/services/whatsappWeb/manager');

const ENV = { WHATSAPP_WEB_ENABLED: 'true', WHATSAPP_AUTH_KEY: 'k'.repeat(40) };
const USER = 'u1';
const OWN_JID = '56912345678:7@s.whatsapp.net';

function emitter() {
  const handlers = {};
  return {
    on: (event, fn) => { (handlers[event] ||= []).push(fn); },
    // Devuelve una promesa para poder esperar a que el manejador termine.
    emit: (event, ...args) => Promise.all((handlers[event] || []).map((fn) => fn(...args))),
  };
}

/** Un manager con librería, almacén y bitácora simulados. */
function setup({ session = null, recent = 0, existing = () => true, onCreate } = {}) {
  let current = session;
  const sockets = [];
  const store = {
    getSession: jest.fn(async () => current),
    saveSession: jest.fn(async (_u, s) => { current = { ...s }; }),
    deleteAll: jest.fn(async () => { current = null; }),
  };
  const baileys = {
    Browsers: { ubuntu: (name) => ['Ubuntu', name, '22.04.4'] },
    fetchLatestBaileysVersion: async () => ({ version: [2, 3000, 1] }),
    makeWASocket: jest.fn((opts) => {
      const sock = {
        opts,
        ev: emitter(),
        user: { id: OWN_JID },
        requestPairingCode: jest.fn(async () => 'ABCD1234'),
        onWhatsApp: jest.fn(async (jid) => [{ jid, exists: existing(jid) }]),
        sendMessage: jest.fn(async () => ({ key: { id: `msg${sockets.length}` } })),
        sendPresenceUpdate: jest.fn(async () => {}),
        end: jest.fn(),
        logout: jest.fn(async () => {}),
      };
      sockets.push(sock);
      // Por defecto la conexión abre sola; las pruebas de vinculación mandan otra cosa.
      const act = onCreate ?? ((s) => s.ev.emit('connection.update', { connection: 'open' }));
      setImmediate(() => act(sock, sockets.length));
      return sock;
    }),
  };
  const messageLog = { countRecent: jest.fn(async () => recent) };
  const logger = { error: jest.fn(), warn: jest.fn() };
  const loadBaileys = jest.fn(async () => baileys);
  const manager = createManager({
    loadBaileys,
    store,
    loadAuthState: jest.fn(async () => ({
      state: { creds: { registered: false }, keys: {} },
      saveCreds: jest.fn(async () => {}),
    })),
    messageLog,
    sleep: jest.fn(async () => {}),
    random: () => 0,
    logger,
  });
  return { manager, store, baileys, sockets, messageLog, logger, loadBaileys, session: () => current };
}

const linked = { status: 'vinculado', phone: '56912345678' };
const askForCode = (sock) => sock.ev.emit('connection.update', { qr: 'qr-de-whatsapp' });

let ctx;
afterEach(() => ctx?.manager.shutdown());

describe('configuración', () => {
  test('viene apagado salvo que el servidor lo active con su clave de cifrado', () => {
    expect(settings({}).enabled).toBe(false);
    expect(settings({ WHATSAPP_WEB_ENABLED: 'true' })).toMatchObject({ enabled: false, problem: 'falta_clave' });
    expect(settings({ WHATSAPP_AUTH_KEY: 'k'.repeat(40) }).enabled).toBe(false);
    expect(settings(ENV)).toMatchObject({ enabled: true, problem: null });
  });

  test('los topes tienen valores prudentes y se pueden cambiar', () => {
    expect(settings(ENV)).toMatchObject({ perHour: 15, maxSessions: 3, idleMs: 5 * 60_000 });
    expect(settings({ ...ENV, WHATSAPP_WEB_MAX_PER_HOUR: '5' }).perHour).toBe(5);
    expect(settings({ ...ENV, WHATSAPP_WEB_MAX_PER_HOUR: 'abc' }).perHour).toBe(15);
    expect(settings({ ...ENV, WHATSAPP_WEB_MAX_PER_HOUR: '-3' }).perHour).toBe(15);
  });

  test('ayudantes de formato', () => {
    expect(prettyCode('abcd1234')).toBe('ABCD-1234');
    expect(prettyCode('corto')).toBe('corto');
    expect(phoneOfJid('56912345678:12@s.whatsapp.net')).toBe('56912345678');
    expect(phoneOfJid(undefined)).toBeNull();
  });
});

describe('vincular', () => {
  const linking = { onCreate: (sock) => askForCode(sock) };

  test('apagado en el servidor: ni siquiera abre la librería', async () => {
    ctx = setup(linking);
    await expect(ctx.manager.startLinking(USER, '56912345678', { env: {} })).rejects.toMatchObject({ code: 'desactivado' });
    expect(ctx.loadBaileys).not.toHaveBeenCalled();
  });

  test('entrega el código de emparejamiento y lo muestra con guion', async () => {
    ctx = setup(linking);
    const result = await ctx.manager.startLinking(USER, '56912345678', { env: ENV });

    expect(result).toEqual({ pairingCode: 'ABCD-1234' });
    expect(ctx.sockets[0].requestPairingCode).toHaveBeenCalledWith('56912345678');
    expect(ctx.session()).toMatchObject({ status: 'vinculando', phone: '56912345678' });
  });

  test('conecta como un navegador conocido y sin bajar el historial', async () => {
    ctx = setup(linking);
    await ctx.manager.startLinking(USER, '56912345678', { env: ENV });
    expect(ctx.sockets[0].opts).toMatchObject({
      browser: ['Ubuntu', 'Chrome', '22.04.4'],
      printQRInTerminal: false,
      markOnlineOnConnect: false,
      syncFullHistory: false,
    });
  });

  test('mientras espera el código, el estado lo dice y lo repite', async () => {
    ctx = setup(linking);
    await ctx.manager.startLinking(USER, '56912345678', { env: ENV });
    expect(await ctx.manager.getStatus(USER, { env: ENV })).toMatchObject({
      status: 'esperando_codigo',
      pairingCode: 'ABCD-1234',
      phone: '56912345678',
    });
  });

  test('al escribir el código en el teléfono queda vinculado con su número', async () => {
    ctx = setup(linking);
    await ctx.manager.startLinking(USER, '56912345678', { env: ENV });
    await ctx.sockets[0].ev.emit('connection.update', { connection: 'open' });

    expect(ctx.session()).toMatchObject({ status: 'vinculado', phone: '56912345678' });
    expect(await ctx.manager.getStatus(USER, { env: ENV })).toMatchObject({ status: 'vinculado', connected: true });
  });

  test('tras vincular WhatsApp pide reabrir la conexión y se reabre con las credenciales nuevas', async () => {
    ctx = setup(linking);
    await ctx.manager.startLinking(USER, '56912345678', { env: ENV });
    await ctx.sockets[0].ev.emit('connection.update', {
      connection: 'close',
      lastDisconnect: { error: { output: { statusCode: 515 } } },
    });
    expect(ctx.baileys.makeWASocket).toHaveBeenCalledTimes(2);
    expect(ctx.sockets[0].end).toHaveBeenCalled();
  });

  test('mientras WhatsApp reabre la conexión tras el código, el estado sigue siendo «vinculando»', async () => {
    // El segundo socket (el que se abre tras el 515) no confirma de inmediato.
    ctx = setup({ onCreate: (sock, n) => (n === 1 ? askForCode(sock) : undefined) });
    await ctx.manager.startLinking(USER, '56912345678', { env: ENV });
    await ctx.sockets[0].ev.emit('connection.update', {
      connection: 'close',
      lastDisconnect: { error: { output: { statusCode: 515 } } },
    });
    expect(ctx.baileys.makeWASocket).toHaveBeenCalledTimes(2);

    expect(await ctx.manager.getStatus(USER, { env: ENV })).toMatchObject({ status: 'vinculando', phone: '56912345678' });

    // Y cuando confirma, pasa a vinculado.
    await ctx.sockets[1].ev.emit('connection.update', { connection: 'open' });
    expect(await ctx.manager.getStatus(USER, { env: ENV })).toMatchObject({ status: 'vinculado' });
  });

  test('si ya hay un WhatsApp vinculado no se vincula otro encima', async () => {
    ctx = setup({ ...linking, session: linked });
    await expect(ctx.manager.startLinking(USER, '56900000000', { env: ENV })).rejects.toMatchObject({ code: 'ya_vinculado' });
    expect(ctx.baileys.makeWASocket).not.toHaveBeenCalled();
  });

  test('sin la librería instalada avisa qué falta, no un error críptico', async () => {
    ctx = setup(linking);
    ctx.loadBaileys.mockRejectedValue(new Error("Cannot find package '@whiskeysockets/baileys'"));
    await expect(ctx.manager.startLinking(USER, '56912345678', { env: ENV })).rejects.toMatchObject({ code: 'sin_libreria' });
  });

  test('si WhatsApp rechaza el número, el error llega al artista', async () => {
    ctx = setup({
      onCreate: (sock) => {
        sock.requestPairingCode.mockRejectedValue(new Error('rate-overlimit'));
        return askForCode(sock);
      },
    });
    await expect(ctx.manager.startLinking(USER, '56912345678', { env: ENV })).rejects.toMatchObject({ code: 'sin_codigo' });
  });
});

describe('estado', () => {
  test('apagado: lo dice sin tocar la base', async () => {
    ctx = setup();
    expect(await ctx.manager.getStatus(USER, { env: {} })).toMatchObject({ status: 'desactivado', enabled: false });
    expect(ctx.store.getSession).not.toHaveBeenCalled();
  });

  test('sin sesión: desvinculado', async () => {
    ctx = setup();
    expect(await ctx.manager.getStatus(USER, { env: ENV })).toMatchObject({ status: 'desvinculado', enabled: true });
  });

  test('vinculada pero con la conexión cerrada (se abre al enviar)', async () => {
    ctx = setup({ session: linked });
    expect(await ctx.manager.getStatus(USER, { env: ENV })).toMatchObject({ status: 'vinculado', phone: '56912345678', connected: false });
  });

  test('isReady solo es cierto con el servidor activo y una sesión vinculada', async () => {
    ctx = setup({ session: linked });
    expect(await ctx.manager.isReady(USER, { env: ENV })).toBe(true);
    expect(await ctx.manager.isReady(USER, { env: {} })).toBe(false);
    ctx = setup({ session: { status: 'vinculando', phone: '1' } });
    expect(await ctx.manager.isReady(USER, { env: ENV })).toBe(false);
    ctx = setup();
    expect(await ctx.manager.isReady(USER, { env: ENV })).toBe(false);
  });
});

describe('enviar', () => {
  test('se conecta al enviar, comprueba que el número existe y manda el texto', async () => {
    ctx = setup({ session: linked });
    const result = await ctx.manager.sendText(USER, '56987654321', 'Hola, te recordamos tu cita', { env: ENV });

    const sock = ctx.sockets[0];
    expect(sock.onWhatsApp).toHaveBeenCalledWith('56987654321@s.whatsapp.net');
    expect(sock.sendMessage).toHaveBeenCalledWith('56987654321@s.whatsapp.net', { text: 'Hola, te recordamos tu cita' });
    expect(result).toEqual({ id: 'msg1' });
  });

  test('muestra «escribiendo…» antes de mandar, como lo haría una persona', async () => {
    ctx = setup({ session: linked });
    await ctx.manager.sendText(USER, '56987654321', 'Hola', { env: ENV });
    const calls = ctx.sockets[0].sendPresenceUpdate.mock.calls.map((c) => c[0]);
    expect(calls).toEqual(['composing', 'paused']);
  });

  test('reutiliza la conexión abierta en el siguiente envío', async () => {
    ctx = setup({ session: linked });
    await ctx.manager.sendText(USER, '56987654321', 'uno', { env: ENV });
    await ctx.manager.sendText(USER, '56911111111', 'dos', { env: ENV });
    expect(ctx.baileys.makeWASocket).toHaveBeenCalledTimes(1);
    expect(ctx.sockets[0].sendMessage).toHaveBeenCalledTimes(2);
  });

  test('un número sin WhatsApp no recibe nada', async () => {
    ctx = setup({ session: linked, existing: () => false });
    await expect(ctx.manager.sendText(USER, '56987654321', 'Hola', { env: ENV })).rejects.toMatchObject({ code: 'sin_whatsapp' });
    expect(ctx.sockets[0].sendMessage).not.toHaveBeenCalled();
  });

  test('el tope por hora corta el envío antes de conectarse siquiera', async () => {
    ctx = setup({ session: linked, recent: 15 });
    await expect(ctx.manager.sendText(USER, '56987654321', 'Hola', { env: ENV })).rejects.toMatchObject({ code: 'tope' });
    expect(ctx.messageLog.countRecent).toHaveBeenCalledWith(USER, 'whatsapp_web', 60);
    expect(ctx.baileys.makeWASocket).not.toHaveBeenCalled();
  });

  test('el tope se puede bajar por configuración', async () => {
    ctx = setup({ session: linked, recent: 5 });
    await expect(
      ctx.manager.sendText(USER, '56987654321', 'Hola', { env: { ...ENV, WHATSAPP_WEB_MAX_PER_HOUR: '5' } })
    ).rejects.toMatchObject({ code: 'tope' });
  });

  test('sin WhatsApp vinculado no envía', async () => {
    ctx = setup();
    await expect(ctx.manager.sendText(USER, '56987654321', 'Hola', { env: ENV })).rejects.toMatchObject({ code: 'no_vinculado' });
    expect(ctx.baileys.makeWASocket).not.toHaveBeenCalled();
  });

  test('apagado en el servidor: rechaza', async () => {
    ctx = setup({ session: linked });
    await expect(ctx.manager.sendText(USER, '56987654321', 'Hola', { env: {} })).rejects.toMatchObject({ code: 'desactivado' });
  });

  test('los envíos de un artista salen en fila y un fallo no frena a los demás', async () => {
    ctx = setup({ session: linked, existing: (jid) => !jid.startsWith('5600') });
    const orden = [];
    const a = ctx.manager.sendText(USER, '56000000000', 'a', { env: ENV }).catch(() => orden.push('a-falló'));
    const b = ctx.manager.sendText(USER, '56911111111', 'b', { env: ENV }).then(() => orden.push('b'));
    const c = ctx.manager.sendText(USER, '56922222222', 'c', { env: ENV }).then(() => orden.push('c'));
    await Promise.all([a, b, c]);
    expect(orden).toEqual(['a-falló', 'b', 'c']);
  });

  test('guarda una pausa entre mensajes seguidos', async () => {
    ctx = setup({ session: linked });
    const sleeps = [];
    const manager = createManager({
      loadBaileys: async () => ctx.baileys,
      store: ctx.store,
      loadAuthState: async () => ({ state: { creds: {}, keys: {} }, saveCreds: async () => {} }),
      messageLog: ctx.messageLog,
      sleep: async (ms) => { sleeps.push(ms); },
      random: () => 0,
      now: () => 1_000_000,
    });
    ctx.manager = manager;
    await manager.sendText(USER, '56911111111', 'uno', { env: ENV });
    sleeps.length = 0;
    await manager.sendText(USER, '56922222222', 'dos', { env: ENV });
    // Con random()=0 la pausa mínima entre mensajes es de 4 s, y ya había uno en este mismo instante.
    expect(sleeps[0]).toBe(4000);
  });
});

describe('prueba y desvinculación', () => {
  test('el mensaje de prueba va al propio número del artista', async () => {
    ctx = setup({ session: linked });
    await ctx.manager.sendTest(USER, { env: ENV });
    expect(ctx.sockets[0].sendMessage).toHaveBeenCalledWith('56912345678@s.whatsapp.net', expect.objectContaining({ text: expect.stringContaining('vinculado') }));
  });

  test('desvincular cierra la sesión en WhatsApp y borra todo lo guardado', async () => {
    ctx = setup({ session: linked });
    await ctx.manager.sendText(USER, '56987654321', 'Hola', { env: ENV });
    await ctx.manager.unlink(USER);

    expect(ctx.sockets[0].logout).toHaveBeenCalled();
    expect(ctx.store.deleteAll).toHaveBeenCalledWith(USER);
    expect(await ctx.manager.getStatus(USER, { env: ENV })).toMatchObject({ status: 'desvinculado' });
  });

  test('desvincular sin conexión igual borra lo guardado', async () => {
    ctx = setup({ session: linked });
    await ctx.manager.unlink(USER);
    expect(ctx.store.deleteAll).toHaveBeenCalledWith(USER);
  });

  test('si el artista cierra la sesión desde su teléfono, el servidor la olvida', async () => {
    ctx = setup({ session: linked });
    await ctx.manager.sendText(USER, '56987654321', 'Hola', { env: ENV });
    await ctx.sockets[0].ev.emit('connection.update', {
      connection: 'close',
      lastDisconnect: { error: { output: { statusCode: 401 } } },
    });
    expect(ctx.store.deleteAll).toHaveBeenCalledWith(USER);
    expect(await ctx.manager.isReady(USER, { env: ENV })).toBe(false);
  });

  test('una caída pasajera con la sesión vinculada se reintenta', async () => {
    ctx = setup({ session: linked });
    await ctx.manager.sendText(USER, '56987654321', 'Hola', { env: ENV });
    await ctx.sockets[0].ev.emit('connection.update', {
      connection: 'close',
      lastDisconnect: { error: { output: { statusCode: 408 } } },
    });
    expect(ctx.baileys.makeWASocket).toHaveBeenCalledTimes(2);
    expect(ctx.store.deleteAll).not.toHaveBeenCalled();
  });
});

describe('límite de conexiones', () => {
  test('con el cupo lleno cierra la conexión más ociosa para abrir la nueva', async () => {
    ctx = setup({ session: linked });
    const env = { ...ENV, WHATSAPP_WEB_MAX_SESSIONS: '1' };
    await ctx.manager.sendText('ana', '56911111111', 'a', { env });
    await ctx.manager.sendText('beto', '56922222222', 'b', { env });

    expect(ctx.sockets).toHaveLength(2);
    expect(ctx.sockets[0].end).toHaveBeenCalled();
    expect(ctx.sockets[1].sendMessage).toHaveBeenCalled();
  });
});

test('WhatsAppWebError lleva un código', () => {
  const e = new WhatsAppWebError('x', { code: 'tope' });
  expect(e).toBeInstanceOf(Error);
  expect(e.code).toBe('tope');
});
