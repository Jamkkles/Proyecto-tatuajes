const request = require('supertest');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Se mockean los módulos que tocan la base de datos y el correo para que
// las pruebas unitarias del controlador no dependan de PostgreSQL ni SMTP.
jest.mock('../src/models/userModel');
jest.mock('../src/models/studioModel');
jest.mock('../src/models/passwordResetModel');
const passwordResetModel = require('../src/models/passwordResetModel');
jest.mock('../src/services/emailService');

const userModel = require('../src/models/userModel');
const studioModel = require('../src/models/studioModel');
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
      role: 'tatuador',
      active: true,
      studio_id: '22222222-2222-2222-2222-222222222222',
      studio_active: true,
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
        if (res.body.user.role !== 'tatuador') throw new Error('Falta el rol');
      })
      .end(done);
  });

  describe('cuentas desactivadas (HU32, HU34)', () => {
    test('un tatuador desactivado no entra, y se le dice por qué', async () => {
      userModel.findByEmail.mockResolvedValue({ ...user, active: false });
      const res = await request(app).post('/api/auth/login').send({ email: user.email, password }).expect(403);
      expect(res.body).toMatchObject({ code: 'user_inactive' });
      expect(res.body.message).toMatch(/desactivada/);
      expect(res.body.token).toBeUndefined();
    });

    test('si su estudio está desactivado, tampoco', async () => {
      userModel.findByEmail.mockResolvedValue({ ...user, studio_active: false });
      const res = await request(app).post('/api/auth/login').send({ email: user.email, password }).expect(403);
      expect(res.body.code).toBe('studio_inactive');
    });

    test('con la contraseña equivocada no se revela que la cuenta está desactivada', async () => {
      userModel.findByEmail.mockResolvedValue({ ...user, active: false });
      const res = await request(app).post('/api/auth/login').send({ email: user.email, password: 'otra-cosa' }).expect(401);
      expect(res.body.message).toBe('Correo o contraseña incorrectos.');
    });

    test('un administrador entra aunque no tenga estudio', async () => {
      userModel.findByEmail.mockResolvedValue({ ...user, role: 'admin', studio_id: null, studio_active: null });
      const res = await request(app).post('/api/auth/login').send({ email: user.email, password }).expect(200);
      expect(res.body.user.role).toBe('admin');
    });
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

describe('POST /api/auth/register (HU01): cada cuenta nueva es su propio estudio', () => {
  beforeEach(() => jest.clearAllMocks());

  test('crea el estudio con plan básico y la cuenta dentro, y entra de inmediato', async () => {
    userModel.findByEmail.mockResolvedValue(null);
    studioModel.createWithOwner.mockResolvedValue({
      studio: { id: 's1', name: 'Ana Rojas', plan: 'basico' },
      user: { id: 'u1', name: 'Ana Rojas', email: 'ana@estudio.cl', role: 'tatuador' },
    });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Ana Rojas', email: 'ana@estudio.cl', password: 'una-clave-larga' })
      .expect(201);

    expect(res.body.token).toBeTruthy();
    expect(res.body.user).toEqual({ id: 'u1', name: 'Ana Rojas', email: 'ana@estudio.cl', role: 'tatuador', mustChangePassword: false });
    const arg = studioModel.createWithOwner.mock.calls[0][0];
    expect(arg.studio).toEqual({ name: 'Ana Rojas', email: 'ana@estudio.cl', plan: 'basico' });
    expect(arg.owner).toMatchObject({ name: 'Ana Rojas', email: 'ana@estudio.cl' });
    expect(await bcrypt.compare('una-clave-larga', arg.owner.passwordHash)).toBe(true);
  });

  test('si dos registros con el mismo correo coinciden, el segundo recibe 409', async () => {
    userModel.findByEmail.mockResolvedValue(null);
    studioModel.createWithOwner.mockRejectedValue(Object.assign(new Error('duplicate key'), { code: '23505' }));

    await request(app)
      .post('/api/auth/register')
      .send({ name: 'Ana', email: 'ana@estudio.cl', password: 'una-clave-larga' })
      .expect(409);
  });
});

describe('el login avisa si hay que cambiar la contraseña temporal', () => {
  test('una cuenta con contraseña del administrador llega con mustChangePassword', async () => {
    const hash = await bcrypt.hash('k7mq-x3vt-9pah', 10);
    userModel.findByEmail.mockResolvedValue({
      id: 'u1', name: 'Beto', email: 'beto@x.cl', password_hash: hash,
      role: 'tatuador', active: true, studio_active: true, must_change_password: true,
    });
    const res = await request(app).post('/api/auth/login').send({ email: 'beto@x.cl', password: 'k7mq-x3vt-9pah' }).expect(200);
    expect(res.body.user.mustChangePassword).toBe(true);
  });
});

describe('POST /api/auth/change-password', () => {
  const jwt = require('jsonwebtoken');
  const SECRET = process.env.JWT_SECRET || 'dev_secret_changeme';
  const auth = `Bearer ${jwt.sign({ sub: 'u1', email: 'a@b.cl' }, SECRET)}`;
  const change = (body) => request(app).post('/api/auth/change-password').set('Authorization', auth).send(body);
  let hash;

  beforeAll(async () => {
    hash = await bcrypt.hash('clave-actual-1', 10);
  });
  beforeEach(() => {
    jest.clearAllMocks();
    userModel.findAuthById.mockResolvedValue({ id: 'u1', password_hash: hash });
  });

  test('sin sesión: 401', async () => {
    await request(app).post('/api/auth/change-password').send({ currentPassword: 'x', newPassword: 'yyyyyyyy' }).expect(401);
  });

  test('con la actual correcta guarda el hash de la nueva, limpia la marca y anula enlaces pendientes', async () => {
    const res = await change({ currentPassword: 'clave-actual-1', newPassword: 'clave-nueva-22' }).expect(200);
    expect(res.body.message).toMatch(/actualizada/);
    const [id, newHash, opts] = userModel.updatePassword.mock.calls[0];
    expect(id).toBe('u1');
    expect(await bcrypt.compare('clave-nueva-22', newHash)).toBe(true);
    // Sin { mustChange: true }: la marca de contraseña temporal queda en false.
    expect(opts).toBeUndefined();
    expect(passwordResetModel.deleteByUserId).toHaveBeenCalledWith('u1');
  });

  test('con la actual equivocada: 400 (no 401, para no cerrar la sesión) y no cambia nada', async () => {
    const res = await change({ currentPassword: 'otra', newPassword: 'clave-nueva-22' }).expect(400);
    expect(res.body.message).toMatch(/actual no es correcta/);
    expect(userModel.updatePassword).not.toHaveBeenCalled();
  });

  test.each([
    [{ newPassword: 'clave-nueva-22' }, /actual y la nueva/],
    [{ currentPassword: 'clave-actual-1', newPassword: 'corta' }, /al menos 8/],
    [{ currentPassword: 'clave-actual-1', newPassword: 'clave-actual-1' }, /distinta/],
  ])('datos inválidos → 400 (%j)', async (body, message) => {
    const res = await change(body).expect(400);
    expect(res.body.message).toMatch(message);
    expect(userModel.updatePassword).not.toHaveBeenCalled();
  });
});

