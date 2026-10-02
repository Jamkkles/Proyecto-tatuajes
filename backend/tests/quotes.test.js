const request = require('supertest');
const jwt = require('jsonwebtoken');
require('dotenv').config();

jest.mock('../src/models/quoteModel');
jest.mock('../src/models/materialModel');
jest.mock('../src/models/projectModel');
jest.mock('../src/models/sketchModel');

const quoteModel = require('../src/models/quoteModel');
const materialModel = require('../src/models/materialModel');
const projectModel = require('../src/models/projectModel');
const sketchModel = require('../src/models/sketchModel');
const app = require('../src/app');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_changeme';
const USER_ID = '11111111-1111-1111-1111-111111111111';
const QUOTE_ID = '22222222-2222-2222-2222-222222222222';
const PROJECT_ID = '33333333-3333-3333-3333-333333333333';
const SKETCH_ID = '44444444-4444-4444-4444-444444444444';
const MATERIAL_ID = '55555555-5555-5555-5555-555555555555';
const auth = `Bearer ${jwt.sign({ sub: USER_ID, email: 'demo@estudio.cl' }, JWT_SECRET)}`;

const tinta = {
  id: MATERIAL_ID,
  name: 'Tinta negra',
  unit: 'ml',
  unit_cost: 900,
  consumption_basis: 'area',
  consumption_rate: 0.05,
};

const quote = {
  id: QUOTE_ID,
  user_id: USER_ID,
  title: 'Dragón en antebrazo',
  width_cm: 15,
  height_cm: 15,
  ink_ratio: 0.35,
  stroke: 'medio',
  color_mode: 'negro',
  sessions_count: 1,
  estimated_minutes: 165,
  materials_cost: 4075,
  status: 'borrador',
  consumed_at: null,
  items: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  materialModel.listByUser.mockResolvedValue([tinta]);
  // Por defecto, toda referencia es del propio artista.
  projectModel.ownsReference.mockResolvedValue(true);
  sketchModel.findByIdForUser.mockResolvedValue(null);
});

describe('Cotizaciones (HU14–HU16)', () => {
  describe('acceso', () => {
    test('sin token devuelve 401', (done) => {
      request(app).get('/api/quotes').expect(401).end(done);
    });

    test('estimar sin token devuelve 401', (done) => {
      request(app).post('/api/quotes/estimate').send({ widthCm: 10, heightCm: 10 }).expect(401).end(done);
    });
  });

  describe('cálculo automatizado (HU14)', () => {
    test('estima el costo sin guardar nada', (done) => {
      request(app)
        .post('/api/quotes/estimate')
        .set('Authorization', auth)
        .send({ widthCm: 15, heightCm: 15, inkRatio: 0.35 })
        .expect(200)
        .expect((res) => {
          expect(res.body.estimate.effectiveArea).toBe(78.75);
          expect(res.body.estimate.items).toHaveLength(1);
          expect(res.body.consumableCount).toBe(1);
          // Estimar no puede tocar la base de datos.
          expect(quoteModel.create).not.toHaveBeenCalled();
        })
        .end(done);
    });

    test('toma la cobertura del boceto enlazado si no viene en el cuerpo', (done) => {
      sketchModel.findByIdForUser.mockResolvedValue({ id: SKETCH_ID, ink_ratio: '0.60000' });

      request(app)
        .post('/api/quotes/estimate')
        .set('Authorization', auth)
        .send({ widthCm: 10, heightCm: 10, sketchId: SKETCH_ID })
        .expect(200)
        .expect((res) => {
          expect(res.body.estimate.inkRatio).toBe(0.6);
          expect(res.body.estimate.effectiveArea).toBe(60);
        })
        .end(done);
    });

    test('un boceto sin cobertura medida usa el valor por defecto', (done) => {
      sketchModel.findByIdForUser.mockResolvedValue({ id: SKETCH_ID, ink_ratio: null });

      request(app)
        .post('/api/quotes/estimate')
        .set('Authorization', auth)
        .send({ widthCm: 10, heightCm: 10, sketchId: SKETCH_ID })
        .expect(200)
        .expect((res) => expect(res.body.estimate.inkRatio).toBe(0.35))
        .end(done);
    });

    test('una tinta con color pero sin regla no se reporta como faltante', (done) => {
      // Tenerla y no haberle puesto tasa de consumo no es lo mismo que no
      // tenerla: lo primero no se cobra, lo segundo hay que ir a comprarlo.
      materialModel.listByUser.mockResolvedValue([
        // La negra sí tiene regla y color.
        { ...tinta, color_hex: '#111111' },
        // La roja tiene color pero nadie le puso tasa de consumo.
        {
          id: '66666666-6666-6666-6666-666666666666',
          name: 'Tinta roja',
          unit: 'ml',
          unit_cost: 1100,
          consumption_basis: 'ninguno',
          consumption_rate: 0,
          color_hex: '#c0392b',
        },
      ]);
      sketchModel.findByIdForUser.mockResolvedValue({
        id: SKETCH_ID,
        ink_ratio: '0.40000',
        palette: [{ hex: '#111111', share: 0.6 }, { hex: '#c0392b', share: 0.4 }],
      });

      request(app)
        .post('/api/quotes/estimate')
        .set('Authorization', auth)
        .send({ widthCm: 20, heightCm: 20, sketchId: SKETCH_ID })
        .expect(200)
        .expect((res) => {
          expect(res.body.estimate.missingInks).toEqual([]);
          expect(res.body.consumableCount).toBe(1);
        })
        .end(done);
    });

    test('reparte la tinta según la paleta del boceto', (done) => {
      sketchModel.findByIdForUser.mockResolvedValue({
        id: SKETCH_ID,
        ink_ratio: '0.40000',
        palette: [{ hex: '#8e44ad', share: 1 }],
      });
      materialModel.listByUser.mockResolvedValue([{ ...tinta, color_hex: '#111111' }]);

      request(app)
        .post('/api/quotes/estimate')
        .set('Authorization', auth)
        .send({ widthCm: 20, heightCm: 20, sketchId: SKETCH_ID })
        .expect(200)
        .expect((res) => {
          // El morado no se hace pasar por negro.
          expect(res.body.estimate.missingInks).toEqual([
            { hex: '#8e44ad', share: 1, suggestion: 'Tinta morada' },
          ]);
        })
        .end(done);
    });

    test('sin medidas devuelve 400', (done) => {
      request(app)
        .post('/api/quotes/estimate')
        .set('Authorization', auth)
        .send({ inkRatio: 0.35 })
        .expect(400)
        .end(done);
    });

    test('una medida fuera de rango devuelve 400', (done) => {
      request(app)
        .post('/api/quotes/estimate')
        .set('Authorization', auth)
        .send({ widthCm: 5000, heightCm: 10 })
        .expect(400)
        .end(done);
    });
  });

  describe('guardado', () => {
    test('calcula el detalle cuando no se envía', (done) => {
      quoteModel.create.mockResolvedValue(quote);

      request(app)
        .post('/api/quotes')
        .set('Authorization', auth)
        .send({ title: '  Dragón  ', widthCm: 15, heightCm: 15, inkRatio: 0.35 })
        .expect(201)
        .expect(() => {
          expect(quoteModel.create).toHaveBeenCalledWith(
            expect.objectContaining({
              userId: USER_ID,
              title: 'Dragón',
              widthCm: 15,
              heightCm: 15,
              items: expect.arrayContaining([
                expect.objectContaining({ name: 'Tinta negra', source: 'calculado' }),
              ]),
            })
          );
        })
        .end(done);
    });

    test('un proyecto ajeno devuelve 400 y no guarda', (done) => {
      projectModel.ownsReference.mockResolvedValue(false);

      request(app)
        .post('/api/quotes')
        .set('Authorization', auth)
        .send({ title: 'x', projectId: PROJECT_ID, widthCm: 10, heightCm: 10 })
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toMatch(/proyecto/i);
          expect(quoteModel.create).not.toHaveBeenCalled();
        })
        .end(done);
    });

    test('enlazar dos cotizaciones a la misma sesión devuelve 409', (done) => {
      const conflicto = Object.assign(new Error('duplicate key'), { code: '23505' });
      quoteModel.create.mockRejectedValue(conflicto);

      request(app)
        .post('/api/quotes')
        .set('Authorization', auth)
        .send({ title: 'x', widthCm: 10, heightCm: 10, sessionId: QUOTE_ID })
        .expect(409)
        .expect((res) => expect(res.body.message).toMatch(/ya tiene una cotización/i))
        .end(done);
    });

    test('sin título devuelve 400', (done) => {
      request(app)
        .post('/api/quotes')
        .set('Authorization', auth)
        .send({ widthCm: 10, heightCm: 10 })
        .expect(400)
        .end(done);
    });
  });

  describe('ajuste del detalle (HU15)', () => {
    const items = [
      { materialId: MATERIAL_ID, name: 'Tinta negra', unit: 'ml', quantity: 6, unitCost: 900, source: 'manual' },
    ];

    test('reemplaza las líneas y recalcula el costo en el servidor', (done) => {
      quoteModel.update.mockResolvedValue({ ...quote, materials_cost: 5400 });

      request(app)
        .patch(`/api/quotes/${QUOTE_ID}`)
        .set('Authorization', auth)
        .send({ items })
        .expect(200)
        .expect(() => {
          expect(quoteModel.update).toHaveBeenCalledWith(
            QUOTE_ID,
            USER_ID,
            // 6 ml × $900 = $5.400, calculado aquí y no leído del cuerpo.
            expect.objectContaining({ materialsCost: 5400 }),
            expect.arrayContaining([expect.objectContaining({ quantity: 6 })])
          );
        })
        .end(done);
    });

    test('un costo enviado por el cliente se ignora', (done) => {
      quoteModel.update.mockResolvedValue(quote);

      request(app)
        .patch(`/api/quotes/${QUOTE_ID}`)
        .set('Authorization', auth)
        .send({ items, materialsCost: 1 })
        .expect(200)
        .expect(() => {
          const fields = quoteModel.update.mock.calls[0][2];
          expect(fields.materialsCost).toBe(5400);
        })
        .end(done);
    });

    test('una línea con cantidad cero devuelve 400', (done) => {
      request(app)
        .patch(`/api/quotes/${QUOTE_ID}`)
        .set('Authorization', auth)
        .send({ items: [{ ...items[0], quantity: 0 }] })
        .expect(400)
        .end(done);
    });

    test('una línea sin cantidad devuelve 400 y no llega al modelo', (done) => {
      const { quantity: _quantity, ...sinCantidad } = items[0];

      request(app)
        .patch(`/api/quotes/${QUOTE_ID}`)
        .set('Authorization', auth)
        .send({ items: [sinCantidad] })
        .expect(400)
        .expect(() => expect(quoteModel.update).not.toHaveBeenCalled())
        .end(done);
    });

    test('una cotización ya consumida devuelve 409', (done) => {
      quoteModel.update.mockResolvedValue(null);
      quoteModel.findByIdForUser.mockResolvedValue({ ...quote, consumed_at: '2026-09-01T12:00:00Z' });

      request(app)
        .patch(`/api/quotes/${QUOTE_ID}`)
        .set('Authorization', auth)
        .send({ title: 'otro' })
        .expect(409)
        .end(done);
    });

    test('una cotización inexistente devuelve 404', (done) => {
      quoteModel.update.mockResolvedValue(null);
      quoteModel.findByIdForUser.mockResolvedValue(null);

      request(app)
        .patch(`/api/quotes/${QUOTE_ID}`)
        .set('Authorization', auth)
        .send({ title: 'otro' })
        .expect(404)
        .end(done);
    });
  });

  describe('descuento de stock (HU16)', () => {
    test('descuenta y reporta lo que quedó en nivel crítico', (done) => {
      quoteModel.consume.mockResolvedValue({
        quote: { ...quote, consumed_at: '2026-09-27T12:00:00Z' },
        affected: [{ id: MATERIAL_ID, name: 'Tinta negra', quantity: 2, min_quantity: 30, low: true }],
      });

      request(app)
        .post(`/api/quotes/${QUOTE_ID}/consume`)
        .set('Authorization', auth)
        .expect(200)
        .expect((res) => {
          expect(res.body.affected[0].low).toBe(true);
          expect(quoteModel.consume).toHaveBeenCalledWith(QUOTE_ID, USER_ID);
        })
        .end(done);
    });

    test('descontar dos veces devuelve 409', (done) => {
      quoteModel.consume.mockResolvedValue(null);
      quoteModel.findByIdForUser.mockResolvedValue({ ...quote, consumed_at: '2026-09-27T12:00:00Z' });

      request(app)
        .post(`/api/quotes/${QUOTE_ID}/consume`)
        .set('Authorization', auth)
        .expect(409)
        .end(done);
    });
  });

  describe('identificadores', () => {
    test('un id con formato inválido devuelve 404 sin consultar', (done) => {
      request(app)
        .get('/api/quotes/no-es-un-uuid')
        .set('Authorization', auth)
        .expect(404)
        .expect(() => expect(quoteModel.findByIdForUser).not.toHaveBeenCalled())
        .end(done);
    });

    test('filtrar por un proyecto con formato inválido devuelve 400', (done) => {
      request(app)
        .get('/api/quotes?projectId=nope')
        .set('Authorization', auth)
        .expect(400)
        .end(done);
    });
  });
});
