/**
 * Rutas de las escenas 3D (HU08–HU10).
 *
 * Igual que en las demás pruebas de rutas, el modelo se sustituye por dobles:
 * lo que se verifica aquí es la validación de lo que llega y el control de
 * acceso, no el SQL (eso lo cubren las pruebas de integración).
 *
 * Esta es la parte de la previsualización que sí se puede verificar con
 * aserciones: la geometría del visor vive en el navegador y se comprobó
 * midiendo, como explica la Iteración 8 de la memoria.
 */
const request = require('supertest');
const jwt = require('jsonwebtoken');
require('dotenv').config();

jest.mock('../src/models/previewModel');

const previewModel = require('../src/models/previewModel');
const app = require('../src/app');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_changeme';
const USER_ID = '11111111-1111-1111-1111-111111111111';
const PREVIEW_ID = '22222222-2222-2222-2222-222222222222';
const SKETCH_ID = '33333333-3333-3333-3333-333333333333';
const token = jwt.sign({ sub: USER_ID, email: 'demo@estudio.cl' }, JWT_SECRET);
const auth = `Bearer ${token}`;

const colocacion = (extra = {}) => ({
  sketchId: SKETCH_ID,
  position: [0.1, 1.1, 0.05],
  quaternion: [0, 0, 0, 1],
  size: [0.08, 0.1, 0.08],
  ...extra,
});

const escena = {
  id: PREVIEW_ID,
  user_id: USER_ID,
  name: 'Brazo de Ana',
  model_id: 'hombre-brazo-der-v1',
  camera: { position: [0, 1.4, 1.2], target: [0, 1.2, 0] },
  placements: [colocacion()],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const cuerpoValido = {
  name: 'Brazo de Ana',
  modelId: 'hombre-brazo-der-v1',
  camera: { position: [0, 1.4, 1.2], target: [0, 1.2, 0] },
  placements: [colocacion()],
};

beforeEach(() => {
  jest.clearAllMocks();
  // Se comporta como el modelo real: devuelve, de los ids pedidos, los que son
  // del artista. Con una lista vacía devuelve vacío, que es lo que permite
  // guardar una escena sin calcas.
  previewModel.ownedSketchIds.mockImplementation(async (ids) =>
    ids.filter((id) => id === SKETCH_ID)
  );
});

describe('GET /api/previews', () => {
  test('sin token responde 401', async () => {
    const res = await request(app).get('/api/previews');
    expect(res.status).toBe(401);
    expect(previewModel.listByUser).not.toHaveBeenCalled();
  });

  test('devuelve las escenas del artista de la sesión', async () => {
    previewModel.listByUser.mockResolvedValue([escena]);

    const res = await request(app).get('/api/previews').set('Authorization', auth);

    expect(res.status).toBe(200);
    expect(res.body.previews).toHaveLength(1);
    expect(previewModel.listByUser).toHaveBeenCalledWith(USER_ID);
  });

  test('si la consulta falla responde 500 sin filtrar el error', async () => {
    previewModel.listByUser.mockRejectedValue(new Error('db caída'));

    const res = await request(app).get('/api/previews').set('Authorization', auth);

    expect(res.status).toBe(500);
    expect(res.body.message).not.toMatch(/db caída/);
  });
});

describe('GET /api/previews/:id', () => {
  test('un id que no es uuid responde 404 sin consultar', async () => {
    const res = await request(app).get('/api/previews/no-es-uuid').set('Authorization', auth);

    expect(res.status).toBe(404);
    expect(previewModel.findByIdForUser).not.toHaveBeenCalled();
  });

  test('la escena de otro artista responde 404', async () => {
    previewModel.findByIdForUser.mockResolvedValue(null);

    const res = await request(app).get(`/api/previews/${PREVIEW_ID}`).set('Authorization', auth);

    expect(res.status).toBe(404);
    expect(previewModel.findByIdForUser).toHaveBeenCalledWith(PREVIEW_ID, USER_ID);
  });

  test('devuelve la escena con sus calcas', async () => {
    previewModel.findByIdForUser.mockResolvedValue(escena);

    const res = await request(app).get(`/api/previews/${PREVIEW_ID}`).set('Authorization', auth);

    expect(res.status).toBe(200);
    expect(res.body.preview.placements[0].sketchId).toBe(SKETCH_ID);
  });

  test('un fallo de la base responde 500', async () => {
    previewModel.findByIdForUser.mockRejectedValue(new Error('db caída'));

    const res = await request(app).get(`/api/previews/${PREVIEW_ID}`).set('Authorization', auth);

    expect(res.status).toBe(500);
  });
});

describe('POST /api/previews', () => {
  test('guarda la escena y responde 201', async () => {
    previewModel.create.mockResolvedValue(escena);

    const res = await request(app).post('/api/previews').set('Authorization', auth).send(cuerpoValido);

    expect(res.status).toBe(201);
    expect(previewModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID, name: 'Brazo de Ana', modelId: 'hombre-brazo-der-v1' })
    );
  });

  test('el nombre es obligatorio y se recorta', async () => {
    const res = await request(app)
      .post('/api/previews')
      .set('Authorization', auth)
      .send({ ...cuerpoValido, name: '   ' });

    expect(res.status).toBe(400);
    expect(previewModel.create).not.toHaveBeenCalled();
  });

  test('rechaza un nombre demasiado largo', async () => {
    const res = await request(app)
      .post('/api/previews')
      .set('Authorization', auth)
      .send({ ...cuerpoValido, name: 'a'.repeat(300) });

    expect(res.status).toBe(400);
  });

  test('rechaza una escena sin modelo', async () => {
    const res = await request(app)
      .post('/api/previews')
      .set('Authorization', auth)
      .send({ ...cuerpoValido, modelId: '' });

    expect(res.status).toBe(400);
  });

  test('rechaza una cámara con formato inválido', async () => {
    const res = await request(app)
      .post('/api/previews')
      .set('Authorization', auth)
      .send({ ...cuerpoValido, camera: { position: [0, 1] } });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/cámara/i);
  });

  test('rechaza una calca sin posición, sin rotación o sin tamaño', async () => {
    const casos = [
      { position: [0, 1] },
      { quaternion: [0, 0, 1] },
      { size: ['a', 'b', 'c'] },
    ];

    for (const parche of casos) {
      const res = await request(app)
        .post('/api/previews')
        .set('Authorization', auth)
        .send({ ...cuerpoValido, placements: [colocacion(parche)] });

      expect(res.status).toBe(400);
    }
    expect(previewModel.create).not.toHaveBeenCalled();
  });

  test('rechaza una calca que no referencia un boceto válido', async () => {
    const res = await request(app)
      .post('/api/previews')
      .set('Authorization', auth)
      .send({ ...cuerpoValido, placements: [colocacion({ sketchId: 'no-es-uuid' })] });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/boceto/i);
  });

  test('rechaza colocaciones que no sean una lista', async () => {
    const res = await request(app)
      .post('/api/previews')
      .set('Authorization', auth)
      .send({ ...cuerpoValido, placements: 'una sola' });

    expect(res.status).toBe(400);
  });

  test('rechaza el boceto de otro artista', async () => {
    previewModel.ownedSketchIds.mockResolvedValue([]);

    const res = await request(app).post('/api/previews').set('Authorization', auth).send(cuerpoValido);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/no existe o no es tuyo/i);
    expect(previewModel.create).not.toHaveBeenCalled();
  });

  test('una escena sin calcas es válida', async () => {
    previewModel.create.mockResolvedValue({ ...escena, placements: [] });

    const res = await request(app)
      .post('/api/previews')
      .set('Authorization', auth)
      .send({ name: 'Vacía', modelId: 'male-v1' });

    expect(res.status).toBe(201);
    expect(previewModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ camera: null, placements: [] })
    );
  });

  test('un fallo al guardar responde 500', async () => {
    previewModel.create.mockRejectedValue(new Error('db caída'));

    const res = await request(app).post('/api/previews').set('Authorization', auth).send(cuerpoValido);

    expect(res.status).toBe(500);
  });
});

describe('PATCH /api/previews/:id', () => {
  test('un id que no es uuid responde 404', async () => {
    const res = await request(app)
      .patch('/api/previews/no-es-uuid')
      .set('Authorization', auth)
      .send({ name: 'Otro' });

    expect(res.status).toBe(404);
    expect(previewModel.update).not.toHaveBeenCalled();
  });

  test('renombra la escena', async () => {
    previewModel.update.mockResolvedValue({ ...escena, name: 'Antebrazo de Ana' });

    const res = await request(app)
      .patch(`/api/previews/${PREVIEW_ID}`)
      .set('Authorization', auth)
      .send({ name: '  Antebrazo de Ana  ' });

    expect(res.status).toBe(200);
    expect(previewModel.update).toHaveBeenCalledWith(PREVIEW_ID, USER_ID, { name: 'Antebrazo de Ana' });
  });

  test('no deja dejar el nombre vacío', async () => {
    const res = await request(app)
      .patch(`/api/previews/${PREVIEW_ID}`)
      .set('Authorization', auth)
      .send({ name: '   ' });

    expect(res.status).toBe(400);
    expect(previewModel.update).not.toHaveBeenCalled();
  });

  test('reemplaza las calcas enteras', async () => {
    previewModel.update.mockResolvedValue({ ...escena, placements: [] });

    const res = await request(app)
      .patch(`/api/previews/${PREVIEW_ID}`)
      .set('Authorization', auth)
      .send({ placements: [] });

    expect(res.status).toBe(200);
    expect(previewModel.update).toHaveBeenCalledWith(PREVIEW_ID, USER_ID, { placements: [] });
  });

  test('rechaza calcas mal formadas al editar', async () => {
    const res = await request(app)
      .patch(`/api/previews/${PREVIEW_ID}`)
      .set('Authorization', auth)
      .send({ placements: [colocacion({ size: [1, 2] })] });

    expect(res.status).toBe(400);
  });

  test('rechaza el boceto ajeno al editar', async () => {
    previewModel.ownedSketchIds.mockResolvedValue([]);

    const res = await request(app)
      .patch(`/api/previews/${PREVIEW_ID}`)
      .set('Authorization', auth)
      .send({ placements: [colocacion()] });

    expect(res.status).toBe(400);
    expect(previewModel.update).not.toHaveBeenCalled();
  });

  test('la escena de otro artista responde 404', async () => {
    previewModel.update.mockResolvedValue(null);

    const res = await request(app)
      .patch(`/api/previews/${PREVIEW_ID}`)
      .set('Authorization', auth)
      .send({ name: 'Mía ahora' });

    expect(res.status).toBe(404);
  });

  test('un fallo al actualizar responde 500', async () => {
    previewModel.update.mockRejectedValue(new Error('db caída'));

    const res = await request(app)
      .patch(`/api/previews/${PREVIEW_ID}`)
      .set('Authorization', auth)
      .send({ name: 'Otro nombre' });

    expect(res.status).toBe(500);
  });
});

describe('DELETE /api/previews/:id', () => {
  test('borra la escena y responde 204', async () => {
    previewModel.remove.mockResolvedValue({ id: PREVIEW_ID });

    const res = await request(app).delete(`/api/previews/${PREVIEW_ID}`).set('Authorization', auth);

    expect(res.status).toBe(204);
    expect(previewModel.remove).toHaveBeenCalledWith(PREVIEW_ID, USER_ID);
  });

  test('un id que no es uuid responde 404', async () => {
    const res = await request(app).delete('/api/previews/no-es-uuid').set('Authorization', auth);

    expect(res.status).toBe(404);
    expect(previewModel.remove).not.toHaveBeenCalled();
  });

  test('la escena de otro artista responde 404', async () => {
    previewModel.remove.mockResolvedValue(null);

    const res = await request(app).delete(`/api/previews/${PREVIEW_ID}`).set('Authorization', auth);

    expect(res.status).toBe(404);
  });

  test('un fallo al borrar responde 500', async () => {
    previewModel.remove.mockRejectedValue(new Error('db caída'));

    const res = await request(app).delete(`/api/previews/${PREVIEW_ID}`).set('Authorization', auth);

    expect(res.status).toBe(500);
  });
});
