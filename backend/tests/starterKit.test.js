const request = require('supertest');
const jwt = require('jsonwebtoken');
require('dotenv').config();

jest.mock('../src/models/materialModel');
jest.mock('../src/models/quoteModel');
jest.mock('../src/models/projectModel');
jest.mock('../src/models/sketchModel');

const materialModel = require('../src/models/materialModel');
const quoteModel = require('../src/models/quoteModel');
const app = require('../src/app');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_changeme';
const USER_ID = '11111111-1111-1111-1111-111111111111';
const auth = `Bearer ${jwt.sign({ sub: USER_ID, email: 'demo@estudio.cl' }, JWT_SECRET)}`;

beforeEach(() => {
  jest.clearAllMocks();
  materialModel.ensureStarterKit.mockResolvedValue(0);
  materialModel.listByUser.mockResolvedValue([]);
  materialModel.listConsumable.mockResolvedValue([]);
  quoteModel.listByUser.mockResolvedValue([]);
});

describe('inventario inicial automático', () => {
  test('entrar al inventario lo prepara antes de listarlo, para el usuario del token', async () => {
    const orden = [];
    materialModel.ensureStarterKit.mockImplementation(async () => orden.push('kit'));
    materialModel.listByUser.mockImplementation(async () => {
      orden.push('lista');
      return [];
    });

    await request(app).get('/api/materials').set('Authorization', auth).expect(200);

    expect(materialModel.ensureStarterKit).toHaveBeenCalledWith(USER_ID);
    // Si se listara antes, la primera visita mostraría el inventario vacío.
    expect(orden).toEqual(['kit', 'lista']);
  });

  test('entrar a las cotizaciones también lo prepara', async () => {
    await request(app).get('/api/quotes').set('Authorization', auth).expect(200);
    expect(materialModel.ensureStarterKit).toHaveBeenCalledWith(USER_ID);
  });

  test('sin sesión no siembra nada: ni siquiera se intenta', async () => {
    await request(app).get('/api/materials').expect(401);
    await request(app).get('/api/quotes').expect(401);
    expect(materialModel.ensureStarterKit).not.toHaveBeenCalled();
  });

  test('si la siembra falla, la pantalla funciona igual y el error queda en el log', async () => {
    materialModel.ensureStarterKit.mockRejectedValue(new Error('columna inexistente'));
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});

    // Pasa cuando se despliega el código antes de correr db:init: no puede
    // romper el inventario por algo que es una comodidad.
    const res = await request(app).get('/api/materials').set('Authorization', auth);

    expect(res.status).toBe(200);
    expect(res.body.materials).toEqual([]);
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  test('el registro ya no siembra: de eso se ocupa la primera visita', () => {
    // La siembra vive en el middleware porque tiene que alcanzar también a las
    // cuentas que ya existían; hacerlo en el registro dejaría fuera a esas.
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(path.join(__dirname, '../src/controllers/authController.js'), 'utf8');
    expect(source).not.toMatch(/createDefaults|ensureStarterKit/);
  });
});
