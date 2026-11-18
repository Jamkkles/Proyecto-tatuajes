/**
 * Completar una sesión ya NO descuenta insumos (decisión del usuario).
 *
 * Una sesión no es todo el tatuaje y un proyecto puede tener cuantas sesiones
 * quiera, así que el descuento se pide a mano desde la cotización guardada
 * (POST /api/quotes/:id/consume). Estas pruebas fijan que la agenda no toque
 * el inventario.
 */
const request = require('supertest');
const jwt = require('jsonwebtoken');
require('dotenv').config();

jest.mock('../src/models/sessionModel');
jest.mock('../src/models/quoteModel');
jest.mock('../src/models/sessionPhotoModel');
jest.mock('../src/services/sessionMessages');
jest.mock('../src/services/stockAlerts');

const sessionModel = require('../src/models/sessionModel');
const quoteModel = require('../src/models/quoteModel');
const sessionMessages = require('../src/services/sessionMessages');
const { notifyLowStock } = require('../src/services/stockAlerts');
const app = require('../src/app');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_changeme';
const USER_ID = '11111111-1111-1111-1111-111111111111';
const SESSION_ID = '22222222-2222-2222-2222-222222222222';
const token = jwt.sign({ sub: USER_ID, email: 'demo@estudio.cl' }, JWT_SECRET);
const auth = `Bearer ${token}`;

const sesion = (extra = {}) => ({
  id: SESSION_ID,
  user_id: USER_ID,
  project_id: '44444444-4444-4444-4444-444444444444',
  starts_at: new Date(Date.now() + 86400000).toISOString(),
  duration_minutes: 120,
  price: 90000,
  paid: false,
  paid_at: null,
  rating: null,
  status: 'agendada',
  notes: null,
  ...extra,
});

beforeEach(() => {
  jest.clearAllMocks();
  sessionModel.findByIdForUser.mockResolvedValue(sesion());
  sessionMessages.afterUpdate.mockResolvedValue(null);
});

test('completar la sesión no descuenta ninguna cotización', async () => {
  sessionModel.update.mockResolvedValue(sesion({ status: 'completada' }));

  const res = await request(app)
    .patch(`/api/sessions/${SESSION_ID}`)
    .set('Authorization', auth)
    .send({ status: 'completada' });

  expect(res.status).toBe(200);
  expect(res.body.session.status).toBe('completada');
  expect(res.body.stock).toBeUndefined();
  expect(quoteModel.findBySession).not.toHaveBeenCalled();
  expect(quoteModel.consume).not.toHaveBeenCalled();
  expect(notifyLowStock).not.toHaveBeenCalled();
});

test('cambiar otra cosa de la sesión tampoco toca el inventario', async () => {
  sessionModel.update.mockResolvedValue(sesion({ paid: true }));

  const res = await request(app)
    .patch(`/api/sessions/${SESSION_ID}`)
    .set('Authorization', auth)
    .send({ paid: true });

  expect(res.status).toBe(200);
  expect(res.body.stock).toBeUndefined();
  expect(quoteModel.consume).not.toHaveBeenCalled();
});

test('la respuesta trae el aviso al cliente cuando corresponde', async () => {
  sessionModel.update.mockResolvedValue(sesion({ status: 'completada' }));
  sessionMessages.afterUpdate.mockResolvedValue({ kind: 'cuidados', sent: true });

  const res = await request(app)
    .patch(`/api/sessions/${SESSION_ID}`)
    .set('Authorization', auth)
    .send({ status: 'completada' });

  expect(res.body.notice).toEqual({ kind: 'cuidados', sent: true });
});

test('una sesión que no es del artista responde 404 antes de tocar nada', async () => {
  sessionModel.findByIdForUser.mockResolvedValue(null);

  const res = await request(app)
    .patch(`/api/sessions/${SESSION_ID}`)
    .set('Authorization', auth)
    .send({ status: 'completada' });

  expect(res.status).toBe(404);
  expect(sessionModel.update).not.toHaveBeenCalled();
});
