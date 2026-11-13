/**
 * Recuperación y cambio de contraseña (HU03 y HU38).
 *
 * Las capas que tocan la base, el correo y el reloj se sustituyen por dobles:
 * lo que se verifica es la conducta del controlador, sobre todo las dos
 * decisiones que protegen al usuario —no revelar qué correos existen y no
 * cerrarle la sesión a quien se equivoca al escribir su contraseña actual.
 */
const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
require('dotenv').config();

jest.mock('../src/models/userModel');
jest.mock('../src/models/passwordResetModel');
jest.mock('../src/services/emailService');

const userModel = require('../src/models/userModel');
const passwordResetModel = require('../src/models/passwordResetModel');
const emailService = require('../src/services/emailService');
const app = require('../src/app');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_changeme';
const USER_ID = '11111111-1111-1111-1111-111111111111';
const token = jwt.sign({ sub: USER_ID, email: 'demo@estudio.cl' }, JWT_SECRET);
const auth = `Bearer ${token}`;

const usuario = {
  id: USER_ID,
  name: 'Demo',
  email: 'demo@estudio.cl',
  password_hash: bcrypt.hashSync('la-de-siempre', 4),
  role: 'tatuador',
  active: true,
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /api/auth/forgot-password', () => {
  test('sin correo responde 400', async () => {
    const res = await request(app).post('/api/auth/forgot-password').send({});

    expect(res.status).toBe(400);
    expect(emailService.sendPasswordReset).not.toHaveBeenCalled();
  });

  test('con un correo registrado manda el enlace', async () => {
    userModel.findByEmail.mockResolvedValue(usuario);
    passwordResetModel.create.mockResolvedValue('token-secreto');
    emailService.sendPasswordReset.mockResolvedValue();

    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'demo@estudio.cl' });

    expect(res.status).toBe(200);
    expect(passwordResetModel.create).toHaveBeenCalledWith(USER_ID);
    const { to, resetUrl } = emailService.sendPasswordReset.mock.calls[0][0];
    expect(to).toBe('demo@estudio.cl');
    expect(resetUrl).toContain('token-secreto');
  });

  test('con un correo que no existe responde exactamente lo mismo', async () => {
    userModel.findByEmail.mockResolvedValue(null);

    const conCuenta = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'nadie@estudio.cl' });

    userModel.findByEmail.mockResolvedValue(usuario);
    passwordResetModel.create.mockResolvedValue('token-secreto');
    emailService.sendPasswordReset.mockResolvedValue();
    const sinCuenta = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'demo@estudio.cl' });

    // Misma respuesta: por aquí no se averigua qué correos están registrados.
    expect(conCuenta.status).toBe(sinCuenta.status);
    expect(conCuenta.body).toEqual(sinCuenta.body);
  });

  test('si falla el envío responde 500 sin dar detalles', async () => {
    userModel.findByEmail.mockResolvedValue(usuario);
    passwordResetModel.create.mockResolvedValue('token-secreto');
    emailService.sendPasswordReset.mockRejectedValue(new Error('SMTP caído'));

    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'demo@estudio.cl' });

    expect(res.status).toBe(500);
    expect(res.body.message).not.toMatch(/SMTP/);
  });
});

describe('POST /api/auth/reset-password', () => {
  test('faltando el token o la contraseña responde 400', async () => {
    expect((await request(app).post('/api/auth/reset-password').send({ token: 'x' })).status).toBe(400);
    expect((await request(app).post('/api/auth/reset-password').send({ password: 'x' })).status).toBe(400);
    expect(userModel.updatePassword).not.toHaveBeenCalled();
  });

  test('un enlace vencido o inventado responde 400', async () => {
    passwordResetModel.findValidByToken.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'vencido', password: 'contrasena-nueva' });

    expect(res.status).toBe(400);
    expect(userModel.updatePassword).not.toHaveBeenCalled();
  });

  test('cambia la contraseña, la guarda hasheada y quema el enlace', async () => {
    passwordResetModel.findValidByToken.mockResolvedValue({ user_id: USER_ID, email: usuario.email });
    userModel.updatePassword.mockResolvedValue();
    passwordResetModel.deleteByUserId.mockResolvedValue();

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'valido', password: 'contrasena-nueva' });

    expect(res.status).toBe(200);
    const [idGuardado, hash] = userModel.updatePassword.mock.calls[0];
    expect(idGuardado).toBe(USER_ID);
    expect(hash).not.toBe('contrasena-nueva');
    expect(await bcrypt.compare('contrasena-nueva', hash)).toBe(true);
    expect(passwordResetModel.deleteByUserId).toHaveBeenCalledWith(USER_ID);
  });

  test('un fallo de la base responde 500', async () => {
    passwordResetModel.findValidByToken.mockRejectedValue(new Error('db caída'));

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'valido', password: 'contrasena-nueva' });

    expect(res.status).toBe(500);
  });
});

describe('POST /api/auth/change-password', () => {
  test('sin sesión responde 401', async () => {
    const res = await request(app)
      .post('/api/auth/change-password')
      .send({ currentPassword: 'la-de-siempre', newPassword: 'otra-distinta' });

    expect(res.status).toBe(401);
  });

  test('rechaza una contraseña nueva corta, vacía o igual a la actual', async () => {
    const casos = [
      { currentPassword: 'la-de-siempre' },
      { currentPassword: 'la-de-siempre', newPassword: 'corta' },
      { currentPassword: 'la-de-siempre', newPassword: 'la-de-siempre' },
    ];

    for (const cuerpo of casos) {
      const res = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', auth)
        .send(cuerpo);
      expect(res.status).toBe(400);
    }
    expect(userModel.updatePassword).not.toHaveBeenCalled();
  });

  test('si la contraseña actual no coincide responde 400, no 401', async () => {
    userModel.findAuthById.mockResolvedValue(usuario);

    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', auth)
      .send({ currentPassword: 'no-era-esta', newPassword: 'otra-distinta' });

    // 400 a propósito: con 401 el frontend cerraría la sesión del usuario.
    expect(res.status).toBe(400);
    expect(userModel.updatePassword).not.toHaveBeenCalled();
  });

  test('cambia la contraseña y anula los enlaces de recuperación pendientes', async () => {
    userModel.findAuthById.mockResolvedValue(usuario);
    userModel.updatePassword.mockResolvedValue();
    passwordResetModel.deleteByUserId.mockResolvedValue();

    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', auth)
      .send({ currentPassword: 'la-de-siempre', newPassword: 'otra-distinta' });

    expect(res.status).toBe(200);
    const [, hash] = userModel.updatePassword.mock.calls[0];
    expect(await bcrypt.compare('otra-distinta', hash)).toBe(true);
    expect(passwordResetModel.deleteByUserId).toHaveBeenCalledWith(USER_ID);
  });

  test('si la cuenta ya no existe responde 404', async () => {
    userModel.findAuthById.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', auth)
      .send({ currentPassword: 'la-de-siempre', newPassword: 'otra-distinta' });

    expect(res.status).toBe(404);
  });

  test('un fallo de la base responde 500', async () => {
    userModel.findAuthById.mockRejectedValue(new Error('db caída'));

    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', auth)
      .send({ currentPassword: 'la-de-siempre', newPassword: 'otra-distinta' });

    expect(res.status).toBe(500);
  });
});
