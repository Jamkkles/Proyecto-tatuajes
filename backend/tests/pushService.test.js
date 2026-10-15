const crypto = require('crypto');
const webpush = require('web-push');

jest.mock('../src/models/pushSubscriptionModel');
const pushSubscriptionModel = require('../src/models/pushSubscriptionModel');
const pushService = require('../src/services/pushService');

const vapid = webpush.generateVAPIDKeys();
const ENV = { VAPID_PUBLIC_KEY: vapid.publicKey, VAPID_PRIVATE_KEY: vapid.privateKey };

/** Una suscripción como la que fabrica un navegador de verdad (claves P-256 reales). */
function realSubscription(endpoint = 'https://push.example.test/send/abc') {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  return {
    endpoint,
    keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: crypto.randomBytes(16).toString('base64url') },
  };
}

const stored = (id, sub) => ({ id, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth });

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => console.error.mockRestore());

describe('configuración', () => {
  test('hace falta la clave pública y la privada', () => {
    expect(pushService.isConfigured({})).toBe(false);
    expect(pushService.isConfigured({ VAPID_PUBLIC_KEY: 'x' })).toBe(false);
    expect(pushService.isConfigured({ VAPID_PRIVATE_KEY: 'x' })).toBe(false);
    expect(pushService.isConfigured(ENV)).toBe(true);
  });

  test('solo expone la pública', () => {
    expect(pushService.publicKey(ENV)).toBe(vapid.publicKey);
    expect(pushService.publicKey({})).toBeNull();
  });

  test('el contacto VAPID sale de VAPID_SUBJECT, o del frontend si es https, o de un valor por defecto', () => {
    expect(pushService.config({ ...ENV, VAPID_SUBJECT: 'mailto:yo@estudio.cl' }).subject).toBe('mailto:yo@estudio.cl');
    expect(pushService.config({ ...ENV, FRONTEND_URL: 'https://tattoo.pages.dev' }).subject).toBe('https://tattoo.pages.dev');
    // http://localhost no vale como contacto VAPID.
    expect(pushService.config({ ...ENV, FRONTEND_URL: 'http://localhost:5173' }).subject).toMatch(/^mailto:/);
  });
});

describe('el mensaje cifrado', () => {
  test('con una suscripción real el mensaje se cifra y se firma sin errores', () => {
    // Lo que valida de verdad la criptografía sin salir a internet: web-push arma
    // la petición exactamente como la enviaría, con claves reales de navegador.
    const sub = realSubscription();
    const details = webpush.generateRequestDetails(sub, JSON.stringify({ title: 'Hola', body: 'Prueba' }), {
      vapidDetails: { subject: 'mailto:dev@localhost.invalid', publicKey: vapid.publicKey, privateKey: vapid.privateKey },
      TTL: 60,
    });

    expect(details.endpoint).toBe(sub.endpoint);
    expect(details.method).toBe('POST');
    expect(details.headers['Content-Encoding']).toBe('aes128gcm');
    expect(details.headers.Authorization).toMatch(/^vapid t=/);
    expect(Buffer.isBuffer(details.body)).toBe(true);
    // Cifrado de verdad: el texto del aviso no viaja en claro.
    expect(details.body.toString('utf8')).not.toContain('Prueba');
  });

  test('unas claves de suscripción mal formadas fallan, no se envían', () => {
    expect(() =>
      webpush.generateRequestDetails({ endpoint: 'https://x.test/a', keys: { p256dh: 'corta', auth: 'corta' } }, 'hola', {
        vapidDetails: { subject: 'mailto:a@b.cl', publicKey: vapid.publicKey, privateKey: vapid.privateKey },
      })
    ).toThrow();
  });
});

describe('sendToUser', () => {
  const payload = { title: 'Hola', body: 'Cuerpo', url: '/citas' };

  test('sin configurar no intenta nada', async () => {
    const sender = { sendNotification: jest.fn() };
    const result = await pushService.sendToUser('u1', payload, { env: {}, sender });
    expect(result).toEqual({ sent: 0, removed: 0, skipped: true });
    expect(pushSubscriptionModel.listByUser).not.toHaveBeenCalled();
  });

  test('manda el aviso a cada dispositivo del artista', async () => {
    const a = realSubscription('https://push.example.test/a');
    const b = realSubscription('https://push.example.test/b');
    pushSubscriptionModel.listByUser.mockResolvedValue([stored('1', a), stored('2', b)]);
    const sender = { sendNotification: jest.fn().mockResolvedValue({}) };

    const result = await pushService.sendToUser('u1', payload, { env: ENV, sender });

    expect(result).toEqual({ sent: 2, removed: 0 });
    expect(sender.sendNotification).toHaveBeenCalledTimes(2);
    const [subscription, body, options] = sender.sendNotification.mock.calls[0];
    expect(subscription).toEqual({ endpoint: a.endpoint, keys: a.keys });
    expect(JSON.parse(body)).toEqual(payload);
    expect(options.vapidDetails.publicKey).toBe(vapid.publicKey);
    expect(options.TTL).toBeGreaterThan(0);
  });

  test('un dispositivo que el servicio de push da por muerto (410 o 404) se borra', async () => {
    const dead410 = realSubscription('https://push.example.test/410');
    const dead404 = realSubscription('https://push.example.test/404');
    const alive = realSubscription('https://push.example.test/ok');
    pushSubscriptionModel.listByUser.mockResolvedValue([stored('d1', dead410), stored('d2', dead404), stored('v1', alive)]);
    const sender = {
      sendNotification: jest.fn(async (sub) => {
        if (sub.endpoint.endsWith('/410')) throw Object.assign(new Error('Gone'), { statusCode: 410 });
        if (sub.endpoint.endsWith('/404')) throw Object.assign(new Error('Not found'), { statusCode: 404 });
        return {};
      }),
    };

    const result = await pushService.sendToUser('u1', payload, { env: ENV, sender });

    expect(result).toEqual({ sent: 1, removed: 2 });
    expect(pushSubscriptionModel.removeById).toHaveBeenCalledWith('d1');
    expect(pushSubscriptionModel.removeById).toHaveBeenCalledWith('d2');
    expect(pushSubscriptionModel.removeById).not.toHaveBeenCalledWith('v1');
  });

  test('un fallo pasajero (500, red) NO borra el dispositivo ni rompe los demás', async () => {
    const flaky = realSubscription('https://push.example.test/flaky');
    const alive = realSubscription('https://push.example.test/ok');
    pushSubscriptionModel.listByUser.mockResolvedValue([stored('f', flaky), stored('v', alive)]);
    const sender = {
      sendNotification: jest.fn(async (sub) => {
        if (sub.endpoint.endsWith('/flaky')) throw Object.assign(new Error('boom'), { statusCode: 500 });
        return {};
      }),
    };

    const result = await pushService.sendToUser('u1', payload, { env: ENV, sender });

    expect(result).toEqual({ sent: 1, removed: 0 });
    expect(pushSubscriptionModel.removeById).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });
});
