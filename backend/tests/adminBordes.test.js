/**
 * Caminos de borde de la administración, los avisos y los canales de mensajería:
 * qué responde cada ruta cuando la capa de abajo falla o cuando el recurso no
 * existe.
 *
 * Son rutas poco visitadas, y justamente por eso conviene fijar su conducta:
 * un 500 silencioso en la administración es difícil de notar en uso normal.
 */
const request = require('supertest');
const jwt = require('jsonwebtoken');
require('dotenv').config();

jest.mock('../src/models/userModel');
jest.mock('../src/models/studioModel');
jest.mock('../src/models/passwordResetModel');
jest.mock('../src/models/notificationModel');
jest.mock('../src/models/notificationSettingsModel');
jest.mock('../src/models/pushSubscriptionModel');
jest.mock('../src/services/pushService');
jest.mock('../src/services/whatsappWeb');

const userModel = require('../src/models/userModel');
const studioModel = require('../src/models/studioModel');
const notificationModel = require('../src/models/notificationModel');
const settingsModel = require('../src/models/notificationSettingsModel');
const pushSubscriptionModel = require('../src/models/pushSubscriptionModel');
const pushService = require('../src/services/pushService');
const whatsappWeb = require('../src/services/whatsappWeb');
const accountStatus = require('../src/services/accountStatus');
const app = require('../src/app');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_changeme';
const USER_ID = '11111111-1111-1111-1111-111111111111';
const ID = '22222222-2222-2222-2222-222222222222';
const token = jwt.sign({ sub: USER_ID, email: 'demo@estudio.cl' }, JWT_SECRET);
const auth = `Bearer ${token}`;

const caida = () => new Error('db caída');
const comoAdmin = () => accountStatus.check.mockResolvedValue({ ok: true, role: 'admin' });

beforeEach(() => {
  jest.clearAllMocks();
  accountStatus.check.mockResolvedValue({ ok: true, role: 'tatuador' });
  settingsModel.DEFAULT_SETTINGS = { remindersEnabled: true };
  whatsappWeb.isEnabled = jest.fn().mockReturnValue(false);
});

describe('administración', () => {
  test('los listados informan si la base falla', async () => {
    comoAdmin();
    studioModel.listWithStats.mockRejectedValue(caida());
    expect((await request(app).get('/api/admin/studios').set('Authorization', auth)).status).toBe(500);

    userModel.listAllWithStats.mockRejectedValue(caida());
    expect((await request(app).get('/api/admin/users').set('Authorization', auth)).status).toBe(500);
  });

  test('crear un estudio con un correo ya usado responde 409', async () => {
    comoAdmin();
    const repetido = Object.assign(new Error('duplicado'), { code: '23505' });
    studioModel.createWithOwner.mockRejectedValue(repetido);

    const res = await request(app)
      .post('/api/admin/studios')
      .set('Authorization', auth)
      .send({ name: 'Estudio', email: 'e@e.cl', ownerName: 'Dueño', ownerEmail: 'd@e.cl' });

    expect(res.status).toBe(409);
  });

  test('agregar un tatuador a un estudio inexistente responde 404, y si el correo existe, 409', async () => {
    comoAdmin();
    studioModel.addTattooist.mockResolvedValue(null);
    const sinEstudio = await request(app)
      .post(`/api/admin/studios/${ID}/tattooists`)
      .set('Authorization', auth)
      .send({ name: 'Nuevo', email: 'n@e.cl' });
    expect(sinEstudio.status).toBe(404);

    studioModel.addTattooist.mockRejectedValue(Object.assign(new Error('duplicado'), { code: '23505' }));
    const repetido = await request(app)
      .post(`/api/admin/studios/${ID}/tattooists`)
      .set('Authorization', auth)
      .send({ name: 'Nuevo', email: 'n@e.cl' });
    expect(repetido.status).toBe(409);
  });

  test('restablecer la contraseña de una cuenta inexistente responde 404 y un fallo, 500', async () => {
    comoAdmin();
    userModel.findById.mockResolvedValue(null);
    expect(
      (await request(app).post(`/api/admin/users/${ID}/reset-password`).set('Authorization', auth)).status
    ).toBe(404);

    userModel.findById.mockResolvedValue({ id: ID, name: 'Alguien' });
    userModel.updatePassword.mockRejectedValue(caida());
    expect(
      (await request(app).post(`/api/admin/users/${ID}/reset-password`).set('Authorization', auth)).status
    ).toBe(500);
  });
});

describe('mi estudio', () => {
  test('quien no es dueño recibe su estudio sin el detalle', async () => {
    studioModel.findOwnedBy.mockResolvedValue(null);
    userModel.findById.mockResolvedValue({ id: USER_ID, studio_id: ID });

    const res = await request(app).get('/api/studio').set('Authorization', auth);

    expect(res.status).toBe(200);
    expect(res.body.isOwner).toBe(false);
    expect(res.body.studio).toEqual({ id: ID });
  });

  test('si la consulta falla responde 500', async () => {
    studioModel.findOwnedBy.mockRejectedValue(caida());

    const res = await request(app).get('/api/studio').set('Authorization', auth);

    expect(res.status).toBe(500);
  });

  test('el resumen informa su fallo', async () => {
    studioModel.findOwnedBy.mockResolvedValue({ id: ID });
    studioModel.summary.mockRejectedValue(caida());

    const res = await request(app)
      .get('/api/studio/summary?from=2026-01-01T00:00:00Z&to=2026-01-31T00:00:00Z')
      .set('Authorization', auth);

    expect(res.status).toBe(500);
  });
});

describe('avisos', () => {
  test('el listado y el marcado informan sus fallos', async () => {
    notificationModel.listByUser.mockRejectedValue(caida());
    expect((await request(app).get('/api/notifications').set('Authorization', auth)).status).toBe(500);

    notificationModel.markRead.mockRejectedValue(caida());
    const res = await request(app)
      .post('/api/notifications/read')
      .set('Authorization', auth)
      .send({ all: true });
    expect(res.status).toBe(500);
  });

  test('la configuración informa su fallo al leerla', async () => {
    settingsModel.get.mockRejectedValue(caida());

    const res = await request(app).get('/api/notification-settings').set('Authorization', auth);

    expect(res.status).toBe(500);
  });
});

describe('push', () => {
  test('quitar un dispositivo exige el endpoint e informa su fallo', async () => {
    const sinEndpoint = await request(app)
      .post('/api/push/unsubscribe')
      .set('Authorization', auth)
      .send({});
    expect(sinEndpoint.status).toBe(400);

    pushSubscriptionModel.removeByEndpoint.mockRejectedValue(caida());
    const falla = await request(app)
      .post('/api/push/unsubscribe')
      .set('Authorization', auth)
      .send({ endpoint: 'https://push.example/abc' });
    expect(falla.status).toBe(500);
  });

  test('el push de prueba avisa si el servidor no lo tiene activado', async () => {
    pushService.isConfigured.mockReturnValue(false);

    const res = await request(app).post('/api/push/test').set('Authorization', auth);

    expect(res.status).toBe(503);
  });

  test('si el envío de prueba falla responde 500', async () => {
    pushService.isConfigured.mockReturnValue(true);
    pushService.sendToUser.mockRejectedValue(caida());

    const res = await request(app).post('/api/push/test').set('Authorization', auth);

    expect(res.status).toBe(500);
  });
});

describe('WhatsApp vinculado', () => {
  test('consultar el estado y desvincular informan sus fallos', async () => {
    whatsappWeb.isEnabled.mockReturnValue(true);
    whatsappWeb.getStatus.mockRejectedValue(new Error('socket caído'));
    expect((await request(app).get('/api/whatsapp-web').set('Authorization', auth)).status).toBe(500);

    whatsappWeb.unlink.mockRejectedValue(new Error('socket caído'));
    expect((await request(app).post('/api/whatsapp-web/unlink').set('Authorization', auth)).status).toBe(500);
  });
});
