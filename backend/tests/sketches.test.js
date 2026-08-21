const request = require('supertest');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// Igual que en las pruebas de login: se mockean las capas que tocan la base de
// datos y el almacenamiento, para probar el controlador de forma aislada.
jest.mock('../src/models/sketchModel');
jest.mock('../src/services/storage');

const sketchModel = require('../src/models/sketchModel');
const storage = require('../src/services/storage');
const app = require('../src/app');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_changeme';
const USER_ID = '11111111-1111-1111-1111-111111111111';
const SKETCH_ID = '22222222-2222-2222-2222-222222222222';
const token = jwt.sign({ sub: USER_ID, email: 'demo@estudio.cl' }, JWT_SECRET);
const auth = `Bearer ${token}`;

// PNG mínimo válido (1×1) para las pruebas de subida.
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

const sketch = {
  id: SKETCH_ID,
  user_id: USER_ID,
  title: 'Dragón oriental',
  description: null,
  body_zone: 'Antebrazo',
  status: 'disponible',
  tags: ['irezumi'],
  url: 'http://localhost:3000/uploads/sketches/x/y.png',
  mime_type: 'image/png',
  size_bytes: 68,
  width: 1,
  height: 1,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

beforeEach(() => {
  jest.clearAllMocks();
  storage.name = 'local';
  storage.save.mockResolvedValue({ key: 'sketches/x/y.png', url: sketch.url });
  storage.remove.mockResolvedValue(undefined);
  storage.getDriver.mockReturnValue({ remove: jest.fn().mockResolvedValue(undefined) });
});

describe('Galería de bocetos (T0010)', () => {
  describe('autenticación', () => {
    test('sin token, listar devuelve 401', (done) => {
      request(app).get('/api/sketches').expect(401).end(done);
    });

    test('sin token, subir devuelve 401', (done) => {
      request(app).post('/api/sketches').expect(401).end(done);
    });
  });

  describe('GET /api/sketches', () => {
    test('devuelve solo los bocetos del usuario del token', (done) => {
      sketchModel.listByUser.mockResolvedValue([sketch]);

      request(app)
        .get('/api/sketches')
        .set('Authorization', auth)
        .expect(200)
        .expect((res) => {
          expect(sketchModel.listByUser).toHaveBeenCalledWith(USER_ID, {
            status: undefined,
            tag: undefined,
          });
          expect(res.body.sketches).toHaveLength(1);
        })
        .end(done);
    });

    test('pasa los filtros de estado y etiqueta al modelo', (done) => {
      sketchModel.listByUser.mockResolvedValue([]);

      request(app)
        .get('/api/sketches?status=tatuado&tag=irezumi')
        .set('Authorization', auth)
        .expect(200)
        .expect(() => {
          expect(sketchModel.listByUser).toHaveBeenCalledWith(USER_ID, {
            status: 'tatuado',
            tag: 'irezumi',
          });
        })
        .end(done);
    });

    test('un estado inválido devuelve 400', (done) => {
      request(app)
        .get('/api/sketches?status=quemado')
        .set('Authorization', auth)
        .expect(400)
        .end(done);
    });
  });

  describe('POST /api/sketches', () => {
    test('sube la imagen, guarda los metadatos y devuelve 201', (done) => {
      sketchModel.create.mockResolvedValue(sketch);

      request(app)
        .post('/api/sketches')
        .set('Authorization', auth)
        .attach('image', PNG_1X1, { filename: 'boceto.png', contentType: 'image/png' })
        .field('title', 'Dragón oriental')
        .field('bodyZone', 'Antebrazo')
        .field('tags', 'irezumi, blackwork')
        .expect(201)
        .expect((res) => {
          // El archivo se manda al almacenamiento bajo la carpeta del usuario…
          expect(storage.save).toHaveBeenCalledWith(
            expect.objectContaining({ userId: USER_ID, mimeType: 'image/png' })
          );
          // …y en la base de datos solo queda la referencia, nunca la imagen.
          expect(sketchModel.create).toHaveBeenCalledWith(
            expect.objectContaining({
              userId: USER_ID,
              title: 'Dragón oriental',
              tags: ['irezumi', 'blackwork'],
              storageDriver: 'local',
              storageKey: 'sketches/x/y.png',
              width: 1,
              height: 1,
            })
          );
          expect(res.body.sketch.id).toBe(SKETCH_ID);
        })
        .end(done);
    });

    test('sin archivo devuelve 400 y no toca el almacenamiento', (done) => {
      request(app)
        .post('/api/sketches')
        .set('Authorization', auth)
        .field('title', 'Sin imagen')
        .expect(400)
        .expect(() => expect(storage.save).not.toHaveBeenCalled())
        .end(done);
    });

    test('sin título devuelve 400', (done) => {
      request(app)
        .post('/api/sketches')
        .set('Authorization', auth)
        .attach('image', PNG_1X1, { filename: 'boceto.png', contentType: 'image/png' })
        .expect(400)
        .end(done);
    });

    test('un archivo que no es imagen devuelve 400', (done) => {
      request(app)
        .post('/api/sketches')
        .set('Authorization', auth)
        .attach('image', Buffer.from('no soy una imagen'), {
          filename: 'nota.txt',
          contentType: 'text/plain',
        })
        .field('title', 'Nota')
        .expect(400)
        .end(done);
    });

    test('si falla el insert se borra el archivo ya subido', (done) => {
      sketchModel.create.mockRejectedValue(new Error('db caída'));

      request(app)
        .post('/api/sketches')
        .set('Authorization', auth)
        .attach('image', PNG_1X1, { filename: 'boceto.png', contentType: 'image/png' })
        .field('title', 'Dragón oriental')
        .expect(500)
        .expect(() => expect(storage.remove).toHaveBeenCalledWith('sketches/x/y.png'))
        .end(done);
    });
  });

  describe('PATCH /api/sketches/:id', () => {
    test('actualiza los metadatos del boceto propio', (done) => {
      sketchModel.update.mockResolvedValue({ ...sketch, status: 'tatuado' });

      request(app)
        .patch(`/api/sketches/${SKETCH_ID}`)
        .set('Authorization', auth)
        .send({ status: 'tatuado' })
        .expect(200)
        .expect((res) => {
          expect(sketchModel.update).toHaveBeenCalledWith(SKETCH_ID, USER_ID, {
            status: 'tatuado',
          });
          expect(res.body.sketch.status).toBe('tatuado');
        })
        .end(done);
    });

    test('un boceto de otro usuario devuelve 404', (done) => {
      sketchModel.update.mockResolvedValue(null);

      request(app)
        .patch(`/api/sketches/${SKETCH_ID}`)
        .set('Authorization', auth)
        .send({ title: 'Ajeno' })
        .expect(404)
        .end(done);
    });

    test('un estado inválido devuelve 400', (done) => {
      request(app)
        .patch(`/api/sketches/${SKETCH_ID}`)
        .set('Authorization', auth)
        .send({ status: 'quemado' })
        .expect(400)
        .end(done);
    });
  });

  describe('DELETE /api/sketches/:id', () => {
    test('borra la fila y el archivo con el driver que lo subió', (done) => {
      const driverRemove = jest.fn().mockResolvedValue(undefined);
      storage.getDriver.mockReturnValue({ remove: driverRemove });
      sketchModel.remove.mockResolvedValue({
        id: SKETCH_ID,
        storage_driver: 'local',
        storage_key: 'sketches/x/y.png',
      });

      request(app)
        .delete(`/api/sketches/${SKETCH_ID}`)
        .set('Authorization', auth)
        .expect(204)
        .expect(() => {
          expect(storage.getDriver).toHaveBeenCalledWith('local');
          expect(driverRemove).toHaveBeenCalledWith('sketches/x/y.png');
        })
        .end(done);
    });

    test('un boceto de otro usuario devuelve 404 y no borra archivos', (done) => {
      sketchModel.remove.mockResolvedValue(null);

      request(app)
        .delete(`/api/sketches/${SKETCH_ID}`)
        .set('Authorization', auth)
        .expect(404)
        .expect(() => expect(storage.getDriver).not.toHaveBeenCalled())
        .end(done);
    });

    test('un id que no es UUID devuelve 404 sin consultar la base', (done) => {
      request(app)
        .delete('/api/sketches/no-es-uuid')
        .set('Authorization', auth)
        .expect(404)
        .expect(() => expect(sketchModel.remove).not.toHaveBeenCalled())
        .end(done);
    });
  });
});
