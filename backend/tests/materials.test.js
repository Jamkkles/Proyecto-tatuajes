const request = require('supertest');
const jwt = require('jsonwebtoken');
require('dotenv').config();

jest.mock('../src/models/materialModel');

const materialModel = require('../src/models/materialModel');
const app = require('../src/app');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_changeme';
const USER_ID = '11111111-1111-1111-1111-111111111111';
const MATERIAL_ID = '77777777-7777-7777-7777-777777777777';
const token = jwt.sign({ sub: USER_ID, email: 'demo@estudio.cl' }, JWT_SECRET);
const auth = `Bearer ${token}`;

const material = {
  id: MATERIAL_ID,
  user_id: USER_ID,
  name: 'Cartuchos RL 03',
  category: 'agujas',
  unit: 'caja',
  quantity: 4,
  min_quantity: 5,
  unit_cost: 18000,
  supplier: 'Distribuidora Ink',
  notes: null,
};

beforeEach(() => jest.clearAllMocks());

describe('Inventario de insumos (HU11–HU13)', () => {
  test('sin token devuelve 401', (done) => {
    request(app).get('/api/materials').expect(401).end(done);
  });

  test('registra un insumo con cantidad, nivel crítico y costo (HU11)', (done) => {
    materialModel.create.mockResolvedValue(material);

    request(app)
      .post('/api/materials')
      .set('Authorization', auth)
      .send({
        name: '  Cartuchos RL 03 ',
        category: 'agujas',
        unit: 'caja',
        quantity: 4,
        minQuantity: 5,
        unitCost: 18000,
        supplier: 'Distribuidora Ink',
      })
      .expect(201)
      .expect(() => {
        expect(materialModel.create).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: USER_ID,
            name: 'Cartuchos RL 03',
            category: 'agujas',
            unit: 'caja',
            quantity: 4,
            minQuantity: 5,
            unitCost: 18000,
          })
        );
      })
      .end(done);
  });

  test('sin nombre devuelve 400', (done) => {
    request(app)
      .post('/api/materials')
      .set('Authorization', auth)
      .send({ quantity: 3 })
      .expect(400)
      .expect(() => expect(materialModel.create).not.toHaveBeenCalled())
      .end(done);
  });

  test('una categoría o unidad inválida devuelve 400', (done) => {
    request(app)
      .post('/api/materials')
      .set('Authorization', auth)
      .send({ name: 'Tinta negra', category: 'pinturas' })
      .expect(400)
      .end(done);
  });

  test('una cantidad negativa o con decimales devuelve 400', (done) => {
    request(app)
      .post('/api/materials')
      .set('Authorization', auth)
      .send({ name: 'Guantes', quantity: -2 })
      .expect(400)
      .expect(() => expect(materialModel.create).not.toHaveBeenCalled())
      .end(done);
  });

  test('filtra por categoría, búsqueda y nivel crítico', (done) => {
    materialModel.listByUser.mockResolvedValue([material]);

    request(app)
      .get('/api/materials?category=agujas&q=RL&low=true')
      .set('Authorization', auth)
      .expect(200)
      .expect((res) => {
        expect(materialModel.listByUser).toHaveBeenCalledWith(USER_ID, {
          category: 'agujas',
          q: 'RL',
          low: true,
        });
        expect(res.body.materials).toHaveLength(1);
      })
      .end(done);
  });

  test('ajusta el stock con un delta (HU12)', (done) => {
    materialModel.adjustStock.mockResolvedValue({ ...material, quantity: 3 });

    request(app)
      .post(`/api/materials/${MATERIAL_ID}/stock`)
      .set('Authorization', auth)
      .send({ delta: -1 })
      .expect(200)
      .expect((res) => {
        expect(materialModel.adjustStock).toHaveBeenCalledWith(MATERIAL_ID, USER_ID, -1);
        expect(res.body.material.quantity).toBe(3);
      })
      .end(done);
  });

  test('un ajuste de 0 o no numérico devuelve 400', (done) => {
    request(app)
      .post(`/api/materials/${MATERIAL_ID}/stock`)
      .set('Authorization', auth)
      .send({ delta: 0 })
      .expect(400)
      .expect(() => expect(materialModel.adjustStock).not.toHaveBeenCalled())
      .end(done);
  });

  test('un insumo de otro artista devuelve 404', (done) => {
    materialModel.update.mockResolvedValue(null);

    request(app)
      .patch(`/api/materials/${MATERIAL_ID}`)
      .set('Authorization', auth)
      .send({ quantity: 10 })
      .expect(404)
      .end(done);
  });

  test('elimina un insumo descontinuado (HU12)', (done) => {
    materialModel.remove.mockResolvedValue({ id: MATERIAL_ID });

    request(app)
      .delete(`/api/materials/${MATERIAL_ID}`)
      .set('Authorization', auth)
      .expect(204)
      .end(done);
  });

  test('un id que no es UUID devuelve 404 sin consultar la base', (done) => {
    request(app)
      .delete('/api/materials/no-es-uuid')
      .set('Authorization', auth)
      .expect(404)
      .expect(() => expect(materialModel.remove).not.toHaveBeenCalled())
      .end(done);
  });
});
