const request = require('supertest');
const jwt = require('jsonwebtoken');
require('dotenv').config();

jest.mock('../src/services/whatsappWeb', () => {
  class WhatsAppWebError extends Error {
    constructor(message, { code = 'error' } = {}) {
      super(message);
      this.name = 'WhatsAppWebError';
      this.code = code;
    }
  }
  return {
    WhatsAppWebError,
    settings: jest.fn(() => ({ enabled: true })),
    getStatus: jest.fn(),
    startLinking: jest.fn(),
    sendTest: jest.fn(),
    unlink: jest.fn(),
    isReady: jest.fn().mockResolvedValue(false),
  };
});

const whatsappWeb = require('../src/services/whatsappWeb');
const app = require('../src/app');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_changeme';
const USER_ID = '11111111-1111-1111-1111-111111111111';
const auth = `Bearer ${jwt.sign({ sub: USER_ID, email: 'demo@estudio.cl' }, JWT_SECRET)}`;

const fail = (code, message = 'mensaje') => new whatsappWeb.WhatsAppWebError(message, { code });

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => console.error.mockRestore?.());

test('todas las rutas exigen sesión', async () => {
  expect((await request(app).get('/api/whatsapp-web')).status).toBe(401);
  expect((await request(app).post('/api/whatsapp-web/link').send({})).status).toBe(401);
  expect((await request(app).post('/api/whatsapp-web/test')).status).toBe(401);
  expect((await request(app).post('/api/whatsapp-web/unlink')).status).toBe(401);
});

describe('GET /api/whatsapp-web', () => {
  test('devuelve el estado del artista que pregunta', async () => {
    whatsappWeb.getStatus.mockResolvedValue({ status: 'vinculado', phone: '56912345678', enabled: true });

    const res = await request(app).get('/api/whatsapp-web').set('Authorization', auth);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'vinculado', phone: '56912345678' });
    expect(whatsappWeb.getStatus).toHaveBeenCalledWith(USER_ID);
  });
});

describe('POST /api/whatsapp-web/link', () => {
  const link = (body) => request(app).post('/api/whatsapp-web/link').set('Authorization', auth).send(body);

  test('sin aceptar el riesgo el servidor no vincula, aunque la pantalla lo permitiera', async () => {
    for (const body of [{ phone: '+56 9 1234 5678' }, { phone: '+56 9 1234 5678', acceptRisk: false }, { phone: '+56 9 1234 5678', acceptRisk: 'true' }]) {
      const res = await link(body);
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/riesgo/);
    }
    expect(whatsappWeb.startLinking).not.toHaveBeenCalled();
  });

  test('un teléfono inválido se rechaza', async () => {
    const res = await link({ phone: '1234', acceptRisk: true });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/número/);
    expect(whatsappWeb.startLinking).not.toHaveBeenCalled();
  });

  test('con el riesgo aceptado entrega el código, y el número se normaliza', async () => {
    whatsappWeb.startLinking.mockResolvedValue({ pairingCode: 'ABCD-1234' });

    const res = await link({ phone: '+56 9 1234 5678', acceptRisk: true });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ pairingCode: 'ABCD-1234' });
    expect(whatsappWeb.startLinking).toHaveBeenCalledWith(USER_ID, '56912345678');
  });

  test.each([
    ['desactivado', 503],
    ['sin_libreria', 503],
    ['ya_vinculado', 409],
    ['sin_codigo', 502],
  ])('el error «%s» se explica con un %i, no con un 500', async (code, status) => {
    whatsappWeb.startLinking.mockRejectedValue(fail(code, 'Explicación para el artista'));

    const res = await link({ phone: '+56 9 1234 5678', acceptRisk: true });

    expect(res.status).toBe(status);
    expect(res.body).toEqual({ message: 'Explicación para el artista', code });
  });

  test('un error inesperado es un 500 sin filtrar detalles', async () => {
    whatsappWeb.startLinking.mockRejectedValue(new Error('password authentication failed for user "x"'));

    const res = await link({ phone: '+56 9 1234 5678', acceptRisk: true });

    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('password');
  });
});

describe('POST /api/whatsapp-web/test', () => {
  test('manda el mensaje de prueba', async () => {
    whatsappWeb.sendTest.mockResolvedValue({ id: 'x' });
    const res = await request(app).post('/api/whatsapp-web/test').set('Authorization', auth);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(whatsappWeb.sendTest).toHaveBeenCalledWith(USER_ID);
  });

  test('sin WhatsApp vinculado explica por qué', async () => {
    whatsappWeb.sendTest.mockRejectedValue(fail('no_vinculado', 'No hay un WhatsApp vinculado.'));
    const res = await request(app).post('/api/whatsapp-web/test').set('Authorization', auth);
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('No hay un WhatsApp vinculado.');
  });
});

describe('POST /api/whatsapp-web/unlink', () => {
  test('desvincula y responde 204', async () => {
    whatsappWeb.unlink.mockResolvedValue();
    const res = await request(app).post('/api/whatsapp-web/unlink').set('Authorization', auth);
    expect(res.status).toBe(204);
    expect(whatsappWeb.unlink).toHaveBeenCalledWith(USER_ID);
  });
});
