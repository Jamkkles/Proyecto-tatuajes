/**
 * Cerrar una sesión descuenta sola la cotización enlazada (HU16).
 *
 * Es la costura entre la agenda y el inventario, y tiene tres reglas que vale
 * la pena fijar: solo ocurre al pasar a «completada», no vuelve a descontar si
 * ya se descontó, y si el descuento falla la cita queda completada igual.
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
const QUOTE_ID = '33333333-3333-3333-3333-333333333333';
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

const descontados = [
  { id: 'a', name: 'Tinta negra', unit: 'ml', quantity: 3, min_quantity: 10, discounted: 4, low: true },
  { id: 'b', name: 'Cartucho', unit: 'unidad', quantity: 40, min_quantity: 10, discounted: 2, low: false },
];

beforeEach(() => {
  jest.clearAllMocks();
  sessionModel.findByIdForUser.mockResolvedValue(sesion());
  sessionMessages.afterUpdate.mockResolvedValue(null);
  notifyLowStock.mockResolvedValue();
});

test('al completar la sesión se descuenta la cotización y se avisa del stock bajo', async () => {
  sessionModel.update.mockResolvedValue(sesion({ status: 'completada' }));
  quoteModel.findBySession.mockResolvedValue({ id: QUOTE_ID, consumed_at: null });
  quoteModel.consume.mockResolvedValue({
    quote: { id: QUOTE_ID, consumed_at: new Date().toISOString() },
    affected: descontados,
  });

  const res = await request(app)
    .patch(`/api/sessions/${SESSION_ID}`)
    .set('Authorization', auth)
    .send({ status: 'completada' });

  expect(res.status).toBe(200);
  expect(quoteModel.consume).toHaveBeenCalledWith(QUOTE_ID, USER_ID);
  expect(res.body.stock.quoteId).toBe(QUOTE_ID);
  expect(res.body.stock.discounted).toHaveLength(2);
  // Solo lo que quedó en nivel crítico se destaca para reponer.
  expect(res.body.stock.low.map((m) => m.name)).toEqual(['Tinta negra']);
  expect(notifyLowStock).toHaveBeenCalledWith(USER_ID, descontados);
});

test('cambiar otra cosa de la sesión no toca el inventario', async () => {
  sessionModel.update.mockResolvedValue(sesion({ paid: true }));

  const res = await request(app)
    .patch(`/api/sessions/${SESSION_ID}`)
    .set('Authorization', auth)
    .send({ paid: true });

  expect(res.status).toBe(200);
  expect(res.body.stock).toBeUndefined();
  expect(quoteModel.findBySession).not.toHaveBeenCalled();
});

test('una sesión sin cotización enlazada se completa sin descontar nada', async () => {
  sessionModel.update.mockResolvedValue(sesion({ status: 'completada' }));
  quoteModel.findBySession.mockResolvedValue(null);

  const res = await request(app)
    .patch(`/api/sessions/${SESSION_ID}`)
    .set('Authorization', auth)
    .send({ status: 'completada' });

  expect(res.status).toBe(200);
  expect(res.body.stock).toBeUndefined();
  expect(quoteModel.consume).not.toHaveBeenCalled();
});

test('completar dos veces no descuenta dos veces', async () => {
  sessionModel.update.mockResolvedValue(sesion({ status: 'completada' }));
  quoteModel.findBySession.mockResolvedValue({ id: QUOTE_ID, consumed_at: new Date().toISOString() });

  const res = await request(app)
    .patch(`/api/sessions/${SESSION_ID}`)
    .set('Authorization', auth)
    .send({ status: 'completada' });

  expect(res.status).toBe(200);
  expect(res.body.stock).toBeUndefined();
  expect(quoteModel.consume).not.toHaveBeenCalled();
});

test('si el descuento del stock falla, la sesión igual queda completada', async () => {
  const error = jest.spyOn(console, 'error').mockImplementation(() => {});
  sessionModel.update.mockResolvedValue(sesion({ status: 'completada' }));
  quoteModel.findBySession.mockResolvedValue({ id: QUOTE_ID, consumed_at: null });
  quoteModel.consume.mockRejectedValue(new Error('inventario caído'));

  const res = await request(app)
    .patch(`/api/sessions/${SESSION_ID}`)
    .set('Authorization', auth)
    .send({ status: 'completada' });

  expect(res.status).toBe(200);
  expect(res.body.session.status).toBe('completada');
  expect(res.body.stock).toBeUndefined();
  expect(error).toHaveBeenCalled();
  error.mockRestore();
});

test('si la cotización ya estaba consumida por otra vía no se informa descuento', async () => {
  sessionModel.update.mockResolvedValue(sesion({ status: 'completada' }));
  quoteModel.findBySession.mockResolvedValue({ id: QUOTE_ID, consumed_at: null });
  quoteModel.consume.mockResolvedValue(null);

  const res = await request(app)
    .patch(`/api/sessions/${SESSION_ID}`)
    .set('Authorization', auth)
    .send({ status: 'completada' });

  expect(res.status).toBe(200);
  expect(res.body.stock).toBeUndefined();
  expect(notifyLowStock).not.toHaveBeenCalled();
});

test('la respuesta también trae el aviso al cliente cuando corresponde', async () => {
  sessionModel.update.mockResolvedValue(sesion({ status: 'completada' }));
  quoteModel.findBySession.mockResolvedValue(null);
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
  expect(quoteModel.findBySession).not.toHaveBeenCalled();
});
