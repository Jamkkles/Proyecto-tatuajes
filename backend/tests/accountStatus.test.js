// El chequeo real de cuentas (el setup lo reemplaza en el resto de las pruebas).
jest.unmock('../src/services/accountStatus');
jest.mock('../src/models/userModel');

const request = require('supertest');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const userModel = require('../src/models/userModel');
const accountStatus = require('../src/services/accountStatus');

const active = { id: 'u1', role: 'tatuador', active: true, studio_active: true };

beforeEach(() => {
  jest.clearAllMocks();
  accountStatus.invalidate();
});

describe('decide', () => {
  test.each([
    ['cuenta activa en estudio activo', active, { ok: true, role: 'tatuador' }],
    ['cuenta que ya no existe', null, { ok: false, reason: 'missing' }],
    ['tatuador desactivado', { ...active, active: false }, { ok: false, reason: 'user_inactive' }],
    ['estudio desactivado', { ...active, studio_active: false }, { ok: false, reason: 'studio_inactive' }],
    ['tatuador sin estudio (cuenta anterior a los estudios)', { ...active, studio_active: null }, { ok: true }],
    ['administrador sin estudio', { ...active, role: 'admin', studio_active: null }, { ok: true, role: 'admin' }],
    ['administrador desactivado', { ...active, role: 'admin', active: false }, { ok: false, reason: 'user_inactive' }],
    ['fila sin el campo active: se niega por las dudas', { id: 'u1', role: 'tatuador' }, { ok: false, reason: 'user_inactive' }],
  ])('%s', (_, row, expected) => {
    expect(accountStatus.decide(row)).toMatchObject(expected);
  });
});

describe('check: consulta la base y guarda la respuesta 30 segundos', () => {
  test('dos chequeos seguidos hacen una sola consulta', async () => {
    userModel.findAccess.mockResolvedValue(active);
    await accountStatus.check('u1', { now: 1000 });
    await accountStatus.check('u1', { now: 2000 });
    expect(userModel.findAccess).toHaveBeenCalledTimes(1);
  });

  test('pasados 30 s vuelve a consultar', async () => {
    userModel.findAccess.mockResolvedValue(active);
    await accountStatus.check('u1', { now: 0 });
    await accountStatus.check('u1', { now: accountStatus.TTL_MS + 1 });
    expect(userModel.findAccess).toHaveBeenCalledTimes(2);
  });

  test('invalidar hace que el cambio se note de inmediato', async () => {
    userModel.findAccess.mockResolvedValueOnce(active).mockResolvedValueOnce({ ...active, active: false });
    expect((await accountStatus.check('u1', { now: 0 })).ok).toBe(true);
    accountStatus.invalidate('u1');
    expect((await accountStatus.check('u1', { now: 1 })).ok).toBe(false);
  });

  test('invalidar sin cuenta limpia todas (al desactivar un estudio entero)', async () => {
    userModel.findAccess.mockResolvedValue(active);
    await accountStatus.check('u1', { now: 0 });
    await accountStatus.check('u2', { now: 0 });
    accountStatus.invalidate();
    await accountStatus.check('u1', { now: 1 });
    await accountStatus.check('u2', { now: 1 });
    expect(userModel.findAccess).toHaveBeenCalledTimes(4);
  });
});

describe('requireAuth corta a una cuenta desactivada aunque su token siga vigente', () => {
  const app = require('../src/app');
  const SECRET = process.env.JWT_SECRET || 'dev_secret_changeme';
  const token = (sub) => `Bearer ${jwt.sign({ sub, email: 'x@y.cl' }, SECRET)}`;

  test('tatuador desactivado → 401 con el motivo, y el frontend cierra la sesión', async () => {
    userModel.findAccess.mockResolvedValue({ ...active, active: false });
    const res = await request(app).get('/api/notifications').set('Authorization', token('u-off')).expect(401);
    expect(res.body).toMatchObject({ code: 'user_inactive' });
  });

  test('estudio desactivado → 401', async () => {
    userModel.findAccess.mockResolvedValue({ ...active, studio_active: false });
    const res = await request(app).get('/api/notifications').set('Authorization', token('u-st')).expect(401);
    expect(res.body.code).toBe('studio_inactive');
  });

  test('si la base no responde, 503 y no se deja pasar', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    userModel.findAccess.mockRejectedValue(new Error('connection terminated'));
    await request(app).get('/api/notifications').set('Authorization', token('u-db')).expect(503);
    console.error.mockRestore();
  });
});
