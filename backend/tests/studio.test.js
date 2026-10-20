const request = require('supertest');
const jwt = require('jsonwebtoken');
require('dotenv').config();

jest.mock('../src/models/studioModel');
jest.mock('../src/models/userModel');

const studioModel = require('../src/models/studioModel');
const userModel = require('../src/models/userModel');
const app = require('../src/app');

const SECRET = process.env.JWT_SECRET || 'dev_secret_changeme';
const OWNER = '11111111-1111-1111-1111-111111111111';
const auth = `Bearer ${jwt.sign({ sub: OWNER, email: 'dueno@x.cl' }, SECRET)}`;
const RANGE = 'from=2026-10-01T03:00:00.000Z&to=2026-11-01T03:00:00.000Z';

beforeEach(() => jest.clearAllMocks());

describe('GET /api/studio', () => {
  test('dice si la cuenta es dueña de su estudio y cuántos tatuadores tiene', async () => {
    studioModel.findOwnedBy.mockResolvedValue({ id: 's1', name: 'Tinta', tattooists_count: 3 });
    const res = await request(app).get('/api/studio').set('Authorization', auth).expect(200);
    expect(res.body).toEqual({ studio: { id: 's1', name: 'Tinta', tattooists_count: 3 }, isOwner: true });
  });

  test('un tatuador que no es dueño: isOwner false', async () => {
    studioModel.findOwnedBy.mockResolvedValue(null);
    userModel.findById.mockResolvedValue({ id: OWNER, studio_id: 's1' });
    const res = await request(app).get('/api/studio').set('Authorization', auth).expect(200);
    expect(res.body.isOwner).toBe(false);
  });
});

describe('GET /api/studio/summary («Mi estudio»)', () => {
  test('solo el dueño ve lo que entró por tatuador', async () => {
    studioModel.findOwnedBy.mockResolvedValue(null);
    const res = await request(app).get(`/api/studio/summary?${RANGE}`).set('Authorization', auth).expect(403);
    expect(res.body.message).toMatch(/dueño/);
    expect(studioModel.summary).not.toHaveBeenCalled();
  });

  test('el dueño recibe el detalle por tatuador y los totales del mes', async () => {
    studioModel.findOwnedBy.mockResolvedValue({ id: 's1', name: 'Tinta' });
    studioModel.summary.mockResolvedValue([
      { id: 'a', name: 'Ana', collected: 300000, pending: 50000, sessions_done: 3, appointments: 2 },
      { id: 'b', name: 'Beto', collected: 120000, pending: 0, sessions_done: 1, appointments: 4 },
    ]);

    const res = await request(app).get(`/api/studio/summary?${RANGE}`).set('Authorization', auth).expect(200);

    expect(studioModel.summary).toHaveBeenCalledWith('s1', {
      from: '2026-10-01T03:00:00.000Z',
      to: '2026-11-01T03:00:00.000Z',
    });
    expect(res.body.totals).toEqual({ collected: 420000, pending: 50000, sessionsDone: 4, appointments: 6 });
    expect(res.body.tattooists).toHaveLength(2);
  });

  test('rango inválido o de más de un mes → 400', async () => {
    await request(app).get('/api/studio/summary').set('Authorization', auth).expect(400);
    await request(app)
      .get('/api/studio/summary?from=2026-01-01T00:00:00Z&to=2026-06-01T00:00:00Z')
      .set('Authorization', auth)
      .expect(400);
    expect(studioModel.findOwnedBy).not.toHaveBeenCalled();
  });
});
