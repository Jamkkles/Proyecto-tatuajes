/**
 * Los caminos del borde de la galería de bocetos: lo que pasa cuando la imagen
 * llega dañada, cuando el almacenamiento no responde y cuando la base falla
 * después de haber subido el archivo.
 *
 * Esa última es la que importa: si la fila no se guarda, el archivo ya subido
 * tiene que borrarse, porque si no queda ocupando espacio sin que nada lo
 * referencie.
 */
const request = require('supertest');
const jwt = require('jsonwebtoken');
require('dotenv').config();

jest.mock('../src/models/sketchModel');
jest.mock('../src/services/storage');
jest.mock('../src/services/imageOptimizer');

const sketchModel = require('../src/models/sketchModel');
const storage = require('../src/services/storage');
const { optimizeImage, readDimensions, readInkProfile } = require('../src/services/imageOptimizer');
const app = require('../src/app');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_changeme';
const USER_ID = '11111111-1111-1111-1111-111111111111';
const SKETCH_ID = '22222222-2222-2222-2222-222222222222';
const token = jwt.sign({ sub: USER_ID, email: 'demo@estudio.cl' }, JWT_SECRET);
const auth = `Bearer ${token}`;

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

const boceto = { id: SKETCH_ID, user_id: USER_ID, title: 'Dragón', tags: [] };

const subir = (campos = {}) => {
  const peticion = request(app)
    .post('/api/sketches')
    .set('Authorization', auth)
    .attach('image', PNG_1X1, 'boceto.png');
  for (const [k, v] of Object.entries({ title: 'Dragón', ...campos })) peticion.field(k, v);
  return peticion;
};

beforeEach(() => {
  jest.clearAllMocks();
  optimizeImage.mockResolvedValue(PNG_1X1);
  readDimensions.mockReturnValue({ width: 1, height: 1 });
  readInkProfile.mockResolvedValue({ inkRatio: 0.3, palette: null });
  storage.save.mockResolvedValue({ key: 'sketches/x/y.png', url: 'http://localhost:3000/uploads/x.png' });
  storage.remove.mockResolvedValue();
  storage.name = 'local';
  storage.getDriver.mockReturnValue({ remove: jest.fn().mockResolvedValue() });
  sketchModel.create.mockResolvedValue(boceto);
});

describe('etiquetas del boceto', () => {
  test('acepta una lista en JSON', async () => {
    await subir({ tags: '["irezumi","negro"]' });

    expect(sketchModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ tags: ['irezumi', 'negro'] })
    );
  });

  test('un JSON mal formado se reparte por comas', async () => {
    await subir({ tags: '[irezumi, negro' });

    expect(sketchModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ tags: ['[irezumi', 'negro'] })
    );
  });

  test('las etiquetas vacías se descartan', async () => {
    await subir({ tags: 'irezumi,  , negro,' });

    expect(sketchModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ tags: ['irezumi', 'negro'] })
    );
  });
});

describe('subida con problemas', () => {
  test('una imagen dañada se rechaza con 400 y no se guarda nada', async () => {
    optimizeImage.mockRejectedValue(new Error('imagen corrupta'));

    const res = await subir();

    expect(res.status).toBe(400);
    expect(storage.save).not.toHaveBeenCalled();
    expect(sketchModel.create).not.toHaveBeenCalled();
  });

  test('si el almacenamiento no responde se avisa con 502', async () => {
    storage.save.mockRejectedValue(new Error('disco lleno'));

    const res = await subir();

    expect(res.status).toBe(502);
    expect(sketchModel.create).not.toHaveBeenCalled();
  });

  test('si la base falla después de subir, el archivo huérfano se borra', async () => {
    sketchModel.create.mockRejectedValue(new Error('db caída'));

    const res = await subir();

    expect(res.status).toBe(500);
    expect(storage.remove).toHaveBeenCalledWith('sketches/x/y.png');
  });

  test('si tampoco se puede borrar el huérfano, igual se responde 500', async () => {
    sketchModel.create.mockRejectedValue(new Error('db caída'));
    storage.remove.mockRejectedValue(new Error('tampoco se pudo borrar'));

    const res = await subir();

    expect(res.status).toBe(500);
  });

  test('sin imagen adjunta responde 400', async () => {
    const res = await request(app)
      .post('/api/sketches')
      .set('Authorization', auth)
      .field('title', 'Sin archivo');

    expect(res.status).toBe(400);
  });
});

describe('listado y filtros', () => {
  test('un estado inventado se rechaza antes de consultar', async () => {
    const res = await request(app).get('/api/sketches?status=inventado').set('Authorization', auth);

    expect(res.status).toBe(400);
    expect(sketchModel.listByUser).not.toHaveBeenCalled();
  });

  test('si la consulta falla responde 500', async () => {
    sketchModel.listByUser.mockRejectedValue(new Error('db caída'));

    const res = await request(app).get('/api/sketches').set('Authorization', auth);

    expect(res.status).toBe(500);
  });
});

describe('edición', () => {
  test('un id que no es uuid responde 404', async () => {
    const res = await request(app)
      .patch('/api/sketches/no-es-uuid')
      .set('Authorization', auth)
      .send({ title: 'Otro' });

    expect(res.status).toBe(404);
    expect(sketchModel.update).not.toHaveBeenCalled();
  });

  test('no se puede dejar el título vacío', async () => {
    const res = await request(app)
      .patch(`/api/sketches/${SKETCH_ID}`)
      .set('Authorization', auth)
      .send({ title: '   ' });

    expect(res.status).toBe(400);
    expect(sketchModel.update).not.toHaveBeenCalled();
  });

  test('si la base falla al editar responde 500', async () => {
    sketchModel.update.mockRejectedValue(new Error('db caída'));

    const res = await request(app)
      .patch(`/api/sketches/${SKETCH_ID}`)
      .set('Authorization', auth)
      .send({ title: 'Nuevo' });

    expect(res.status).toBe(500);
  });
});

describe('borrado', () => {
  test('si el archivo no se puede borrar, la fila igual se elimina', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    sketchModel.remove.mockResolvedValue({
      id: SKETCH_ID,
      storage_driver: 'local',
      storage_key: 'sketches/x/y.png',
    });
    storage.getDriver.mockReturnValue({
      remove: jest.fn().mockRejectedValue(new Error('archivo bloqueado')),
    });

    const res = await request(app).delete(`/api/sketches/${SKETCH_ID}`).set('Authorization', auth);

    expect(res.status).toBe(204);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  test('si la base falla al borrar responde 500', async () => {
    sketchModel.remove.mockRejectedValue(new Error('db caída'));

    const res = await request(app).delete(`/api/sketches/${SKETCH_ID}`).set('Authorization', auth);

    expect(res.status).toBe(500);
  });
});
