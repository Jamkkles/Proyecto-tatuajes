const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
require('dotenv').config();

jest.mock('../src/models/studioModel');
jest.mock('../src/models/userModel');
jest.mock('../src/models/passwordResetModel');

const studioModel = require('../src/models/studioModel');
const userModel = require('../src/models/userModel');
const passwordResetModel = require('../src/models/passwordResetModel');
const accountStatus = require('../src/services/accountStatus');
const app = require('../src/app');

const SECRET = process.env.JWT_SECRET || 'dev_secret_changeme';
const ADMIN_ID = '99999999-9999-9999-9999-999999999999';
const STUDIO_ID = '22222222-2222-2222-2222-222222222222';
const USER_ID = '11111111-1111-1111-1111-111111111111';
const auth = `Bearer ${jwt.sign({ sub: ADMIN_ID, email: 'admin@plataforma.cl' }, SECRET)}`;

const asAdmin = () => accountStatus.check.mockResolvedValue({ ok: true, role: 'admin' });
const TEMP_RE = /^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/;

beforeEach(() => {
  jest.clearAllMocks();
  asAdmin();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => console.error.mockRestore());

describe('acceso', () => {
  test('sin sesión: 401', async () => {
    await request(app).get('/api/admin/studios').expect(401);
  });

  test('un tatuador no entra al panel de administración: 403', async () => {
    accountStatus.check.mockResolvedValue({ ok: true, role: 'tatuador' });
    const res = await request(app).get('/api/admin/studios').set('Authorization', auth).expect(403);
    expect(res.body.message).toMatch(/administrador/);
    expect(studioModel.listWithStats).not.toHaveBeenCalled();
  });

  test('el rol sale de la base, no del token: un token viejo de alguien degradado no sirve', async () => {
    accountStatus.check.mockResolvedValue({ ok: true, role: 'tatuador' });
    const forged = `Bearer ${jwt.sign({ sub: ADMIN_ID, email: 'x', role: 'admin' }, SECRET)}`;
    await request(app).get('/api/admin/studios').set('Authorization', forged).expect(403);
  });
});

describe('GET /api/admin/studios (HU35, HU36)', () => {
  test('lista los estudios con sus tatuadores, métricas y totales', async () => {
    studioModel.listWithStats.mockResolvedValue([
      { id: 'a', active: true, tattooists: [{ active: true }, { active: false }], sessions_total: 10, upcoming_appointments: 2, sketches_total: 5, clients_total: 4 },
      { id: 'b', active: false, tattooists: [{ active: true }], sessions_total: 3, upcoming_appointments: 1, sketches_total: 0, clients_total: 1 },
    ]);

    const res = await request(app).get('/api/admin/studios').set('Authorization', auth).expect(200);

    expect(res.body.studios).toHaveLength(2);
    expect(res.body.totals).toEqual({
      studios: 2,
      activeStudios: 1,
      tattooists: 3,
      activeTattooists: 2,
      sessions: 13,
      upcomingAppointments: 3,
      sketches: 5,
      clients: 5,
    });
  });
});

describe('POST /api/admin/studios (HU31)', () => {
  const create = (body) => request(app).post('/api/admin/studios').set('Authorization', auth).send(body);

  test('crea el estudio con su primer tatuador y devuelve la contraseña temporal una vez', async () => {
    userModel.findByEmail.mockResolvedValue(null);
    studioModel.createWithOwner.mockImplementation(async ({ studio, owner }) => ({
      studio: { id: STUDIO_ID, ...studio },
      user: { id: USER_ID, name: owner.name, email: owner.email, role: 'tatuador' },
    }));

    const res = await create({ name: 'Tinta Negra', email: 'Hola@TintaNegra.cl', plan: 'profesional', ownerName: 'Ana' }).expect(201);

    expect(res.body.studio).toMatchObject({ name: 'Tinta Negra', email: 'hola@tintanegra.cl', plan: 'profesional' });
    expect(res.body.user).toMatchObject({ name: 'Ana', email: 'hola@tintanegra.cl' });
    expect(res.body.temporaryPassword).toMatch(TEMP_RE);
    // Lo guardado es el hash de esa misma contraseña, nunca el texto.
    const { owner } = studioModel.createWithOwner.mock.calls[0][0];
    expect(owner.passwordHash).not.toContain(res.body.temporaryPassword);
    expect(await bcrypt.compare(res.body.temporaryPassword, owner.passwordHash)).toBe(true);
  });

  test('el tatuador puede tener un correo distinto del estudio', async () => {
    userModel.findByEmail.mockResolvedValue(null);
    studioModel.createWithOwner.mockResolvedValue({ studio: {}, user: {} });
    await create({ name: 'X', email: 'estudio@x.cl', ownerName: 'Beto', ownerEmail: 'beto@x.cl' }).expect(201);
    expect(studioModel.createWithOwner.mock.calls[0][0].owner.email).toBe('beto@x.cl');
    expect(studioModel.createWithOwner.mock.calls[0][0].studio.plan).toBe('basico');
  });

  test.each([
    [{ email: 'a@b.cl', ownerName: 'Ana' }, /nombre del estudio/],
    [{ name: 'X', email: 'no-es-correo', ownerName: 'Ana' }, /formato/],
    [{ name: 'X', email: 'a@b.cl' }, /nombre del tatuador/],
    [{ name: 'X', email: 'a@b.cl', ownerName: 'Ana', plan: 'gratis' }, /Plan/],
  ])('datos inválidos → 400 (%j)', async (body, message) => {
    const res = await create(body).expect(400);
    expect(res.body.message).toMatch(message);
    expect(studioModel.createWithOwner).not.toHaveBeenCalled();
  });

  test('si el correo ya tiene cuenta → 409', async () => {
    userModel.findByEmail.mockResolvedValue({ id: 'otro' });
    await create({ name: 'X', email: 'a@b.cl', ownerName: 'Ana' }).expect(409);
    expect(studioModel.createWithOwner).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/admin/studios/:id (HU32)', () => {
  const patch = (body) => request(app).patch(`/api/admin/studios/${STUDIO_ID}`).set('Authorization', auth).send(body);

  test('desactivar el estudio corta de inmediato a todos sus tatuadores', async () => {
    studioModel.update.mockResolvedValue({ id: STUDIO_ID, active: false });
    await patch({ active: false }).expect(200);
    expect(studioModel.update).toHaveBeenCalledWith(STUDIO_ID, expect.objectContaining({ active: false }));
    expect(accountStatus.invalidate).toHaveBeenCalledWith();
  });

  test('cambiar el plan no toca el acceso', async () => {
    studioModel.update.mockResolvedValue({ id: STUDIO_ID, plan: 'estudio' });
    await patch({ plan: 'estudio' }).expect(200);
    expect(accountStatus.invalidate).not.toHaveBeenCalled();
  });

  test('estudio inexistente → 404; plan inválido → 400', async () => {
    studioModel.update.mockResolvedValue(null);
    await patch({ plan: 'basico' }).expect(404);
    await patch({ plan: 'nada' }).expect(400);
    await request(app).patch('/api/admin/studios/no-es-uuid').set('Authorization', auth).send({}).expect(404);
  });
});

describe('POST /api/admin/studios/:id/tattooists (HU33)', () => {
  const add = (body) => request(app).post(`/api/admin/studios/${STUDIO_ID}/tattooists`).set('Authorization', auth).send(body);

  test('agrega el tatuador al estudio con contraseña temporal', async () => {
    userModel.findByEmail.mockResolvedValue(null);
    studioModel.addTattooist.mockResolvedValue({ id: USER_ID, name: 'Caro', email: 'caro@x.cl' });

    const res = await add({ name: 'Caro', email: 'caro@x.cl' }).expect(201);

    expect(res.body.user.name).toBe('Caro');
    expect(res.body.temporaryPassword).toMatch(TEMP_RE);
    expect(studioModel.addTattooist).toHaveBeenCalledWith(STUDIO_ID, expect.objectContaining({ name: 'Caro', email: 'caro@x.cl' }));
  });

  test('estudio inexistente → 404; correo ocupado → 409', async () => {
    userModel.findByEmail.mockResolvedValue(null);
    studioModel.addTattooist.mockResolvedValue(null);
    await add({ name: 'Caro', email: 'caro@x.cl' }).expect(404);

    userModel.findByEmail.mockResolvedValue({ id: 'otro' });
    await add({ name: 'Caro', email: 'caro@x.cl' }).expect(409);
  });
});

describe('PATCH /api/admin/users/:id (HU34)', () => {
  const patch = (id, body) => request(app).patch(`/api/admin/users/${id}`).set('Authorization', auth).send(body);

  test('desactiva al tatuador y su sesión deja de valer de inmediato', async () => {
    userModel.findById.mockResolvedValue({ id: USER_ID, role: 'tatuador', active: true });
    userModel.setActive.mockResolvedValue({ id: USER_ID, active: false });

    const res = await patch(USER_ID, { active: false }).expect(200);

    expect(res.body.user.active).toBe(false);
    expect(userModel.setActive).toHaveBeenCalledWith(USER_ID, false);
    expect(accountStatus.invalidate).toHaveBeenCalledWith(USER_ID);
  });

  test('reactivar también', async () => {
    userModel.findById.mockResolvedValue({ id: USER_ID, role: 'tatuador', active: false });
    userModel.setActive.mockResolvedValue({ id: USER_ID, active: true });
    await patch(USER_ID, { active: true }).expect(200);
  });

  test('el administrador no puede desactivarse a sí mismo', async () => {
    const res = await patch(ADMIN_ID, { active: false }).expect(400);
    expect(res.body.message).toMatch(/propia cuenta/);
    expect(userModel.setActive).not.toHaveBeenCalled();
  });

  test('no se puede desactivar al último administrador activo', async () => {
    userModel.findById.mockResolvedValue({ id: USER_ID, role: 'admin', active: true });
    userModel.countActiveAdmins.mockResolvedValue(1);
    await patch(USER_ID, { active: false }).expect(409);
    expect(userModel.setActive).not.toHaveBeenCalled();
  });

  test('sin «active» → 400; usuario inexistente → 404', async () => {
    await patch(USER_ID, {}).expect(400);
    userModel.findById.mockResolvedValue(null);
    await patch(USER_ID, { active: true }).expect(404);
  });
});

describe('POST /api/admin/users/:id/reset-password (HU38)', () => {
  test('pone una contraseña temporal nueva y anula los enlaces de recuperación pendientes', async () => {
    userModel.findById.mockResolvedValue({ id: USER_ID });

    const res = await request(app).post(`/api/admin/users/${USER_ID}/reset-password`).set('Authorization', auth).expect(200);

    expect(res.body.temporaryPassword).toMatch(TEMP_RE);
    const [id, hash] = userModel.updatePassword.mock.calls[0];
    expect(id).toBe(USER_ID);
    expect(await bcrypt.compare(res.body.temporaryPassword, hash)).toBe(true);
    expect(passwordResetModel.deleteByUserId).toHaveBeenCalledWith(USER_ID);
  });

  test('usuario inexistente → 404', async () => {
    userModel.findById.mockResolvedValue(null);
    await request(app).post(`/api/admin/users/${USER_ID}/reset-password`).set('Authorization', auth).expect(404);
    expect(userModel.updatePassword).not.toHaveBeenCalled();
  });

  test('cada contraseña temporal es distinta', async () => {
    userModel.findById.mockResolvedValue({ id: USER_ID });
    const a = await request(app).post(`/api/admin/users/${USER_ID}/reset-password`).set('Authorization', auth);
    const b = await request(app).post(`/api/admin/users/${USER_ID}/reset-password`).set('Authorization', auth);
    expect(a.body.temporaryPassword).not.toBe(b.body.temporaryPassword);
  });
});
