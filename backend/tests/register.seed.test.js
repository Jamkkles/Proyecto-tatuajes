const request = require('supertest');
require('dotenv').config();

jest.mock('../src/models/userModel');
jest.mock('../src/models/passwordResetModel');
jest.mock('../src/models/materialModel');
jest.mock('../src/services/emailService');

const userModel = require('../src/models/userModel');
const materialModel = require('../src/models/materialModel');
const app = require('../src/app');

const NEW_USER = {
  id: '22222222-2222-2222-2222-222222222222',
  name: 'Ana Tatuadora',
  email: 'ana@estudio.cl',
};
const body = { name: NEW_USER.name, email: NEW_USER.email, password: 'una-clave-larga-1' };

beforeEach(() => {
  jest.clearAllMocks();
  userModel.findByEmail.mockResolvedValue(null);
  userModel.create.mockResolvedValue(NEW_USER);
});

describe('insumos iniciales al registrarse', () => {
  test('una cuenta nueva recibe el kit básico, a su nombre', async () => {
    materialModel.createDefaults.mockResolvedValue([]);

    const res = await request(app).post('/api/auth/register').send(body);

    expect(res.status).toBe(201);
    expect(materialModel.createDefaults).toHaveBeenCalledTimes(1);
    expect(materialModel.createDefaults).toHaveBeenCalledWith(NEW_USER.id);
  });

  test('si falla la carga, la cuenta se crea igual y se avisa en el log', async () => {
    materialModel.createDefaults.mockRejectedValue(new Error('db caída'));
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});

    const res = await request(app).post('/api/auth/register').send(body);

    // Perder el registro por un problema del inventario sería peor: el artista
    // puede pedir el kit desde la pantalla de inventario.
    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  test('un registro rechazado no carga nada', async () => {
    userModel.findByEmail.mockResolvedValue({ id: 'otro' });

    const res = await request(app).post('/api/auth/register').send(body);

    expect(res.status).toBe(409);
    expect(materialModel.createDefaults).not.toHaveBeenCalled();
  });

  test('con el registro cerrado tampoco', async () => {
    process.env.ALLOW_REGISTER = 'false';
    try {
      const res = await request(app).post('/api/auth/register').send(body);
      expect(res.status).toBe(403);
      expect(materialModel.createDefaults).not.toHaveBeenCalled();
    } finally {
      delete process.env.ALLOW_REGISTER;
    }
  });
});
