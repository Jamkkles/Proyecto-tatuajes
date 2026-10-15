const request = require('supertest');
const jwt = require('jsonwebtoken');
const webpush = require('web-push');
require('dotenv').config();

jest.mock('../src/models/notificationModel');
jest.mock('../src/models/notificationSettingsModel', () => ({
  ...jest.requireActual('../src/models/notificationSettingsModel'),
  get: jest.fn(),
  save: jest.fn(),
}));
jest.mock('../src/models/pushSubscriptionModel');
jest.mock('../src/services/pushService', () => ({
  ...jest.requireActual('../src/services/pushService'),
  sendToUser: jest.fn(),
}));
jest.mock('../src/services/reminders');

const notificationModel = require('../src/models/notificationModel');
const settingsModel = require('../src/models/notificationSettingsModel');
const pushSubscriptionModel = require('../src/models/pushSubscriptionModel');
const pushService = require('../src/services/pushService');
const { runReminders } = require('../src/services/reminders');
const app = require('../src/app');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_changeme';
const USER_ID = '11111111-1111-1111-1111-111111111111';
const auth = `Bearer ${jwt.sign({ sub: USER_ID, email: 'demo@estudio.cl' }, JWT_SECRET)}`;
const ID = '22222222-2222-2222-2222-222222222222';

const KEYS = webpush.generateVAPIDKeys();
const goodSubscription = {
  endpoint: 'https://push.example.test/send/abc',
  keys: { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' },
};

beforeEach(() => {
  jest.clearAllMocks();
  process.env.VAPID_PUBLIC_KEY = KEYS.publicKey;
  process.env.VAPID_PRIVATE_KEY = KEYS.privateKey;
  // El .env de quien corre las pruebas puede tener el WhatsApp vinculado encendido; aquí no.
  delete process.env.WHATSAPP_WEB_ENABLED;
});

describe('campanita: /api/notifications', () => {
  test('sin sesión no se ve nada', async () => {
    await request(app).get('/api/notifications').expect(401);
    await request(app).post('/api/notifications/read').send({ all: true }).expect(401);
  });

  test('lista los avisos del artista del token con cuántos faltan por leer', async () => {
    notificationModel.listByUser.mockResolvedValue({ notifications: [{ id: ID, title: 'Hola' }], unread: 3 });

    const res = await request(app).get('/api/notifications').set('Authorization', auth).expect(200);

    expect(res.body).toEqual({ notifications: [{ id: ID, title: 'Hola' }], unread: 3 });
    expect(notificationModel.listByUser).toHaveBeenCalledWith(USER_ID, { limit: 30 });
  });

  test('el límite tiene tope', async () => {
    notificationModel.listByUser.mockResolvedValue({ notifications: [], unread: 0 });
    await request(app).get('/api/notifications?limit=100000').set('Authorization', auth);
    expect(notificationModel.listByUser).toHaveBeenCalledWith(USER_ID, { limit: 100 });
    await request(app).get('/api/notifications?limit=0').set('Authorization', auth);
    expect(notificationModel.listByUser).toHaveBeenLastCalledWith(USER_ID, { limit: 30 });
  });

  test('marca como leídos los ids dados, siempre para el artista del token', async () => {
    notificationModel.markRead.mockResolvedValue(1);
    await request(app).post('/api/notifications/read').set('Authorization', auth).send({ ids: [ID] }).expect(200, { updated: 1 });
    expect(notificationModel.markRead).toHaveBeenCalledWith(USER_ID, { ids: [ID], all: false });
  });

  test('o todos', async () => {
    notificationModel.markRead.mockResolvedValue(5);
    await request(app).post('/api/notifications/read').set('Authorization', auth).send({ all: true }).expect(200, { updated: 5 });
    expect(notificationModel.markRead).toHaveBeenCalledWith(USER_ID, { ids: undefined, all: true });
  });

  test.each([
    ['sin cuerpo', {}],
    ['ids que no son uuid', { ids: ['no-es-uuid'] }],
    ['lista vacía', { ids: [] }],
    ['all como texto', { all: 'true' }],
    ['demasiados ids', { ids: Array(101).fill(ID) }],
  ])('rechaza %s', async (_, body) => {
    await request(app).post('/api/notifications/read').set('Authorization', auth).send(body).expect(400);
    expect(notificationModel.markRead).not.toHaveBeenCalled();
  });
});

describe('push: /api/push', () => {
  test('la configuración dice si está activo y trae solo la clave pública', async () => {
    const res = await request(app).get('/api/push/config').set('Authorization', auth).expect(200);
    expect(res.body).toEqual({ enabled: true, publicKey: KEYS.publicKey });
    expect(JSON.stringify(res.body)).not.toContain(KEYS.privateKey);
  });

  test('sin claves VAPID en el servidor, no está activo', async () => {
    delete process.env.VAPID_PUBLIC_KEY;
    const res = await request(app).get('/api/push/config').set('Authorization', auth).expect(200);
    expect(res.body).toEqual({ enabled: false, publicKey: null });
    await request(app).post('/api/push/subscribe').set('Authorization', auth).send(goodSubscription).expect(503);
  });

  test('guarda la suscripción del dispositivo para el artista del token', async () => {
    pushSubscriptionModel.save.mockResolvedValue({ id: 'x' });
    await request(app)
      .post('/api/push/subscribe')
      .set('Authorization', auth)
      .set('User-Agent', 'iPhone Safari')
      .send(goodSubscription)
      .expect(201);
    expect(pushSubscriptionModel.save).toHaveBeenCalledWith({
      userId: USER_ID,
      endpoint: goodSubscription.endpoint,
      p256dh: goodSubscription.keys.p256dh,
      auth: goodSubscription.keys.auth,
      userAgent: 'iPhone Safari',
    });
  });

  test.each([
    ['sin cuerpo', {}],
    ['endpoint http (no https)', { ...goodSubscription, endpoint: 'http://push.example.test/a' }],
    ['endpoint que no es una URL', { ...goodSubscription, endpoint: 'hola' }],
    ['sin claves', { endpoint: goodSubscription.endpoint }],
    ['claves demasiado cortas', { endpoint: goodSubscription.endpoint, keys: { p256dh: 'a', auth: 'b' } }],
    ['claves con caracteres raros', { endpoint: goodSubscription.endpoint, keys: { p256dh: '<script>alert(1)</script>', auth: goodSubscription.keys.auth } }],
  ])('rechaza una suscripción %s', async (_, body) => {
    await request(app).post('/api/push/subscribe').set('Authorization', auth).send(body).expect(400);
    expect(pushSubscriptionModel.save).not.toHaveBeenCalled();
  });

  test('quita solo el dispositivo del artista del token', async () => {
    pushSubscriptionModel.removeByEndpoint.mockResolvedValue(1);
    await request(app).post('/api/push/unsubscribe').set('Authorization', auth).send({ endpoint: goodSubscription.endpoint }).expect(204);
    expect(pushSubscriptionModel.removeByEndpoint).toHaveBeenCalledWith(USER_ID, goodSubscription.endpoint);
    await request(app).post('/api/push/unsubscribe').set('Authorization', auth).send({}).expect(400);
  });

  test('el aviso de prueba llega solo a los dispositivos de quien lo pide', async () => {
    pushService.sendToUser.mockResolvedValue({ sent: 1, removed: 0 });
    const res = await request(app).post('/api/push/test').set('Authorization', auth).expect(200);
    expect(res.body).toEqual({ sent: 1, removed: 0 });
    expect(pushService.sendToUser).toHaveBeenCalledWith(USER_ID, expect.objectContaining({ title: expect.any(String) }));
  });
});

describe('configuración de avisos: /api/notification-settings (HU28)', () => {
  const settings = {
    remindersEnabled: true,
    changeNoticeEnabled: true,
    aftercareEnabled: true,
    reminderNote: 'Nota',
    aftercareNote: 'Cuidados',
  };

  test('trae la configuración y qué canales hay en el servidor', async () => {
    settingsModel.get.mockResolvedValue(settings);
    const res = await request(app).get('/api/notification-settings').set('Authorization', auth).expect(200);
    expect(res.body.settings).toEqual(settings);
    // Sin credenciales de WhatsApp el canal es manual; con VAPID el push está activo.
    expect(res.body.channels).toEqual({ whatsapp: 'manual', push: true, whatsappWeb: false });
  });

  test('con credenciales de WhatsApp el canal pasa a automático', async () => {
    settingsModel.get.mockResolvedValue(settings);
    process.env.WHATSAPP_TOKEN = 't';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '1';
    try {
      const res = await request(app).get('/api/notification-settings').set('Authorization', auth);
      expect(res.body.channels.whatsapp).toBe('automatico');
    } finally {
      delete process.env.WHATSAPP_TOKEN;
      delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    }
  });

  test('guarda solo lo que viene', async () => {
    settingsModel.save.mockResolvedValue({ ...settings, remindersEnabled: false });
    await request(app).put('/api/notification-settings').set('Authorization', auth).send({ remindersEnabled: false }).expect(200);
    const fields = settingsModel.save.mock.calls[0][1];
    expect(settingsModel.save.mock.calls[0][0]).toBe(USER_ID);
    expect(fields.remindersEnabled).toBe(false);
    expect(fields.reminderNote).toBeUndefined();
  });

  test('los saltos de línea se juntan en uno solo (WhatsApp no los admite en una plantilla)', async () => {
    settingsModel.save.mockResolvedValue(settings);
    await request(app)
      .put('/api/notification-settings')
      .set('Authorization', auth)
      .send({ reminderNote: '  Trae ropa cómoda.\n\n   Come algo antes.\t' })
      .expect(200);
    expect(settingsModel.save.mock.calls[0][1].reminderNote).toBe('Trae ropa cómoda. Come algo antes.');
  });

  test.each([
    ['texto vacío', { reminderNote: '   ' }],
    ['texto de cuidados vacío', { aftercareNote: '' }],
    ['recordatorio demasiado largo', { reminderNote: 'a'.repeat(301) }],
    ['cuidados demasiado largos', { aftercareNote: 'a'.repeat(601) }],
    ['bandera que no es booleana', { remindersEnabled: 'si' }],
  ])('rechaza %s', async (_, body) => {
    await request(app).put('/api/notification-settings').set('Authorization', auth).send(body).expect(400);
    expect(settingsModel.save).not.toHaveBeenCalled();
  });
});

describe('programador externo: POST /api/jobs/reminders', () => {
  const SUMMARY = { checked: 2, whatsapp: 0, manual: 2, omitted: 0, duplicates: 0, errors: 0 };
  afterEach(() => delete process.env.CRON_SECRET);

  test('sin CRON_SECRET configurado el endpoint no existe (no queda una puerta abierta por olvido)', async () => {
    delete process.env.CRON_SECRET;
    await request(app).post('/api/jobs/reminders').expect(404);
    await request(app).post('/api/jobs/reminders').set('X-Cron-Secret', 'cualquiera').expect(404);
    expect(runReminders).not.toHaveBeenCalled();
  });

  test('sin la clave o con otra, 401 y no corre nada', async () => {
    process.env.CRON_SECRET = 'la-clave-correcta';
    await request(app).post('/api/jobs/reminders').expect(401);
    await request(app).post('/api/jobs/reminders').set('X-Cron-Secret', 'otra').expect(401);
    await request(app).post('/api/jobs/reminders').set('X-Cron-Secret', 'la-clave-correct').expect(401); // un carácter menos
    await request(app).post('/api/jobs/reminders').set('Authorization', auth).expect(401); // una sesión de usuario no vale
    expect(runReminders).not.toHaveBeenCalled();
  });

  test('con la clave correcta corre los recordatorios y devuelve el resumen', async () => {
    process.env.CRON_SECRET = 'la-clave-correcta';
    runReminders.mockResolvedValue(SUMMARY);
    const res = await request(app).post('/api/jobs/reminders').set('X-Cron-Secret', 'la-clave-correcta').expect(200);
    expect(res.body).toEqual(SUMMARY);
    expect(runReminders).toHaveBeenCalledTimes(1);
  });

  test('solo se acepta por POST', async () => {
    process.env.CRON_SECRET = 'la-clave-correcta';
    await request(app).get('/api/jobs/reminders').set('X-Cron-Secret', 'la-clave-correcta').expect(404);
  });

  test('si falla, 500 sin filtrar el error', async () => {
    process.env.CRON_SECRET = 'la-clave-correcta';
    runReminders.mockRejectedValue(new Error('detalle interno de la base'));
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await request(app).post('/api/jobs/reminders').set('X-Cron-Secret', 'la-clave-correcta');
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('detalle interno');
    log.mockRestore();
  });
});
