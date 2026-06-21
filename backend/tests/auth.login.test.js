const request = require('supertest');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Se mockean los módulos que tocan la base de datos y el correo para que
// las pruebas unitarias del controlador no dependan de PostgreSQL ni SMTP.
jest.mock('../src/models/userModel');
jest.mock('../src/models/passwordResetModel');
jest.mock('../src/services/emailService');

const userModel = require('../src/models/userModel');
const app = require('../src/app');

// Credenciales de prueba tomadas del entorno (.env); valores neutros por
// defecto para no exponer datos personales en el código.
const TEST_NAME = process.env.SEED_NAME || 'Artista Demo';
const TEST_EMAIL = process.env.SEED_EMAIL || 'demo@estudio.cl';
const TEST_PASSWORD = process.env.SEED_PASSWORD || 'cambia-esta-clave';

describe('POST /api/auth/login (HU02)', () => {
  const password = TEST_PASSWORD;
  let user;

  beforeAll(async () => {
    user = {
      id: '11111111-1111-1111-1111-111111111111',
      name: TEST_NAME,
      email: TEST_EMAIL,
      password_hash: await bcrypt.hash(password, 10),
    };
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('credenciales válidas devuelven 200 con token y usuario', (done) => {
    userModel.findByEmail.mockResolvedValue(user);

    request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password })
      .expect('Content-Type', /json/)
      .expect(200)
      .expect((res) => {
        if (!res.body.token) throw new Error('No se recibió el token');
        if (res.body.user.email !== user.email) throw new Error('Correo incorrecto');
        if ('password_hash' in res.body.user) throw new Error('Se filtró el hash');
      })
      .end(done);
  });

  test('contraseña incorrecta devuelve 401', (done) => {
    userModel.findByEmail.mockResolvedValue(user);

    request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: 'clave-incorrecta' })
      .expect(401)
      .expect((res) => {
        if (!res.body.message) throw new Error('Falta el mensaje de error');
      })
      .end(done);
  });

  test('correo inexistente devuelve 401', (done) => {
    userModel.findByEmail.mockResolvedValue(null);

    request(app)
      .post('/api/auth/login')
      .send({ email: 'noexiste@correo.cl', password })
      .expect(401)
      .end(done);
  });

  test('faltan campos obligatorios devuelve 400', (done) => {
    request(app)
      .post('/api/auth/login')
      .send({ email: user.email })
      .expect(400)
      .end(done);
  });
});
