/**
 * Caminos de borde de la agenda, el inventario y las cotizaciones: lo que
 * responde cada ruta cuando la capa de abajo falla, cuando el recurso no
 * existe y cuando lo que llega no es válido.
 *
 * Importan sobre todo los dos casos en que ya se subió un archivo: si la fila
 * de la foto no se puede guardar, el archivo tiene que borrarse.
 */
const request = require('supertest');
const jwt = require('jsonwebtoken');
require('dotenv').config();

jest.mock('../src/models/clientModel');
jest.mock('../src/models/projectModel');
jest.mock('../src/models/sessionModel');
jest.mock('../src/models/sessionPhotoModel');
jest.mock('../src/models/materialModel');
jest.mock('../src/models/quoteModel');
jest.mock('../src/services/storage');
jest.mock('../src/services/storage/removeFiles');
jest.mock('../src/services/imageOptimizer');
jest.mock('../src/services/sessionMessages');
jest.mock('../src/services/stockAlerts');

const clientModel = require('../src/models/clientModel');
const projectModel = require('../src/models/projectModel');
const sessionModel = require('../src/models/sessionModel');
const photoModel = require('../src/models/sessionPhotoModel');
const materialModel = require('../src/models/materialModel');
const quoteModel = require('../src/models/quoteModel');
const storage = require('../src/services/storage');
const { removeFiles } = require('../src/services/storage/removeFiles');
const { optimizeImage, readDimensions } = require('../src/services/imageOptimizer');
const sessionMessages = require('../src/services/sessionMessages');
const { notifyLowStock } = require('../src/services/stockAlerts');
const app = require('../src/app');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_changeme';
const USER_ID = '11111111-1111-1111-1111-111111111111';
const ID = '22222222-2222-2222-2222-222222222222';
const OTRO_ID = '33333333-3333-3333-3333-333333333333';
const token = jwt.sign({ sub: USER_ID, email: 'demo@estudio.cl' }, JWT_SECRET);
const auth = `Bearer ${token}`;

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

const caida = () => new Error('db caída');

beforeEach(() => {
  jest.clearAllMocks();
  storage.name = 'local';
  storage.save.mockResolvedValue({ key: 'sessions/x/y.png', url: 'http://localhost:3000/uploads/y.png' });
  optimizeImage.mockResolvedValue(PNG_1X1);
  readDimensions.mockReturnValue({ width: 1, height: 1 });
  removeFiles.mockResolvedValue();
  sessionMessages.afterUpdate.mockResolvedValue(null);
  notifyLowStock.mockResolvedValue();
  photoModel.filesFor.mockResolvedValue([]);
});

describe('clientes', () => {
  test('un teléfono o un correo mal escritos se rechazan', async () => {
    const malTelefono = await request(app)
      .post('/api/clients')
      .set('Authorization', auth)
      .send({ name: 'Ana', phone: 'no-es-un-teléfono!!' });
    expect(malTelefono.status).toBe(400);

    const malCorreo = await request(app)
      .post('/api/clients')
      .set('Authorization', auth)
      .send({ name: 'Ana', email: 'esto-no-es-correo' });
    expect(malCorreo.status).toBe(400);

    expect(clientModel.create).not.toHaveBeenCalled();
  });

  test('editar un cliente que no existe responde 404 y un fallo responde 500', async () => {
    clientModel.update.mockResolvedValue(null);
    const noExiste = await request(app)
      .patch(`/api/clients/${ID}`)
      .set('Authorization', auth)
      .send({ name: 'Nuevo' });
    expect(noExiste.status).toBe(404);

    clientModel.update.mockRejectedValue(caida());
    const falla = await request(app)
      .patch(`/api/clients/${ID}`)
      .set('Authorization', auth)
      .send({ name: 'Nuevo' });
    expect(falla.status).toBe(500);
  });

  test('borrar: id inválido, inexistente y fallo de la base', async () => {
    const invalido = await request(app).delete('/api/clients/no-es-uuid').set('Authorization', auth);
    expect(invalido.status).toBe(404);

    clientModel.remove.mockResolvedValue(null);
    const noExiste = await request(app).delete(`/api/clients/${ID}`).set('Authorization', auth);
    expect(noExiste.status).toBe(404);

    clientModel.remove.mockRejectedValue(caida());
    const falla = await request(app).delete(`/api/clients/${ID}`).set('Authorization', auth);
    expect(falla.status).toBe(500);
  });

  test('al borrar un cliente se eliminan los archivos de sus fotos', async () => {
    photoModel.filesFor.mockResolvedValue([{ storage_driver: 'local', storage_key: 'a.png' }]);
    clientModel.remove.mockResolvedValue({ id: ID });

    const res = await request(app).delete(`/api/clients/${ID}`).set('Authorization', auth);

    expect(res.status).toBe(204);
    expect(photoModel.filesFor).toHaveBeenCalledWith('client', ID, USER_ID);
    expect(removeFiles).toHaveBeenCalledWith([{ storage_driver: 'local', storage_key: 'a.png' }]);
  });
});

describe('proyectos', () => {
  test('una medida fuera de rango se rechaza', async () => {
    const res = await request(app)
      .patch(`/api/projects/${ID}`)
      .set('Authorization', auth)
      .send({ widthCm: 5000 });

    expect(res.status).toBe(400);
    expect(projectModel.update).not.toHaveBeenCalled();
  });

  test('una medida vacía la borra', async () => {
    projectModel.update.mockResolvedValue({ id: ID, width_cm: null });

    const res = await request(app)
      .patch(`/api/projects/${ID}`)
      .set('Authorization', auth)
      .send({ widthCm: '' });

    expect(res.status).toBe(200);
    expect(projectModel.update).toHaveBeenCalledWith(ID, USER_ID, expect.objectContaining({ widthCm: null }));
  });

  test('borrar: id inválido, inexistente, con archivos y fallo', async () => {
    expect((await request(app).delete('/api/projects/no-es-uuid').set('Authorization', auth)).status).toBe(404);

    projectModel.remove.mockResolvedValue(null);
    expect((await request(app).delete(`/api/projects/${ID}`).set('Authorization', auth)).status).toBe(404);

    photoModel.filesFor.mockResolvedValue([{ storage_driver: 'local', storage_key: 'b.png' }]);
    projectModel.remove.mockResolvedValue({ id: ID });
    const ok = await request(app).delete(`/api/projects/${ID}`).set('Authorization', auth);
    expect(ok.status).toBe(204);
    expect(removeFiles).toHaveBeenCalled();

    projectModel.remove.mockRejectedValue(caida());
    expect((await request(app).delete(`/api/projects/${ID}`).set('Authorization', auth)).status).toBe(500);
  });
});

describe('sesiones', () => {
  test('el listado exige un rango razonable y avisa si la base falla', async () => {
    const sinRango = await request(app).get('/api/sessions').set('Authorization', auth);
    expect(sinRango.status).toBe(400);

    const demasiado = await request(app)
      .get('/api/sessions?from=2020-01-01T00:00:00Z&to=2030-01-01T00:00:00Z')
      .set('Authorization', auth);
    expect(demasiado.status).toBe(400);

    sessionModel.listByUser.mockRejectedValue(caida());
    const falla = await request(app)
      .get('/api/sessions?from=2026-01-01T00:00:00Z&to=2026-02-01T00:00:00Z')
      .set('Authorization', auth);
    expect(falla.status).toBe(500);
  });

  test('agendar sin proyecto válido o en un proyecto ajeno responde 400', async () => {
    const sinProyecto = await request(app)
      .post('/api/sessions')
      .set('Authorization', auth)
      .send({ startsAt: new Date().toISOString() });
    expect(sinProyecto.status).toBe(400);

    sessionModel.create.mockResolvedValue(null);
    const ajeno = await request(app)
      .post('/api/sessions')
      .set('Authorization', auth)
      .send({ projectId: ID, startsAt: new Date(Date.now() + 86400000).toISOString() });
    expect(ajeno.status).toBe(400);
  });

  test('borrar una sesión elimina sus fotos del almacenamiento', async () => {
    photoModel.filesFor.mockResolvedValue([{ storage_driver: 'local', storage_key: 'c.png' }]);
    sessionModel.remove.mockResolvedValue({ id: ID });

    const res = await request(app).delete(`/api/sessions/${ID}`).set('Authorization', auth);

    expect(res.status).toBe(204);
    expect(photoModel.filesFor).toHaveBeenCalledWith('session', ID, USER_ID);
    expect(removeFiles).toHaveBeenCalled();
  });

  test('borrar: id inválido, inexistente y fallo', async () => {
    expect((await request(app).delete('/api/sessions/no-es-uuid').set('Authorization', auth)).status).toBe(404);

    sessionModel.remove.mockResolvedValue(null);
    expect((await request(app).delete(`/api/sessions/${ID}`).set('Authorization', auth)).status).toBe(404);

    sessionModel.remove.mockRejectedValue(caida());
    expect((await request(app).delete(`/api/sessions/${ID}`).set('Authorization', auth)).status).toBe(500);
  });
});

describe('fotos de la sesión', () => {
  const subirFoto = (id = ID) =>
    request(app)
      .post(`/api/sessions/${id}/photos`)
      .set('Authorization', auth)
      .attach('image', PNG_1X1, 'foto.png');

  test('rechaza un id inválido y una petición sin imagen', async () => {
    const invalido = await request(app)
      .post('/api/sessions/no-es-uuid/photos')
      .set('Authorization', auth)
      .attach('image', PNG_1X1, 'foto.png');
    expect(invalido.status).toBe(404);

    const sinImagen = await request(app).post(`/api/sessions/${ID}/photos`).set('Authorization', auth);
    expect(sinImagen.status).toBe(400);
  });

  test('la sesión se comprueba antes de subir el archivo', async () => {
    sessionModel.findByIdForUser.mockResolvedValue(null);

    const res = await subirFoto();

    expect(res.status).toBe(404);
    expect(storage.save).not.toHaveBeenCalled();
  });

  test('una imagen dañada responde 400 y el almacenamiento caído, 502', async () => {
    sessionModel.findByIdForUser.mockResolvedValue({ id: ID });

    optimizeImage.mockRejectedValue(new Error('imagen corrupta'));
    expect((await subirFoto()).status).toBe(400);

    optimizeImage.mockResolvedValue(PNG_1X1);
    storage.save.mockRejectedValue(new Error('disco lleno'));
    expect((await subirFoto()).status).toBe(502);
  });

  test('si la sesión desaparece mientras sube la imagen, el archivo se borra', async () => {
    sessionModel.findByIdForUser.mockResolvedValue({ id: ID });
    photoModel.create.mockResolvedValue(null);

    const res = await subirFoto();

    expect(res.status).toBe(404);
    expect(removeFiles).toHaveBeenCalledWith([
      { storage_driver: 'local', storage_key: 'sessions/x/y.png' },
    ]);
  });

  test('si la fila falla, el archivo subido también se borra', async () => {
    sessionModel.findByIdForUser.mockResolvedValue({ id: ID });
    photoModel.create.mockRejectedValue(caida());

    const res = await subirFoto();

    expect(res.status).toBe(500);
    expect(removeFiles).toHaveBeenCalled();
  });

  test('borrar una foto: ids inválidos, inexistente y fallo', async () => {
    const invalido = await request(app)
      .delete(`/api/sessions/${ID}/photos/no-es-uuid`)
      .set('Authorization', auth);
    expect(invalido.status).toBe(404);

    photoModel.remove.mockResolvedValue(null);
    const noExiste = await request(app)
      .delete(`/api/sessions/${ID}/photos/${OTRO_ID}`)
      .set('Authorization', auth);
    expect(noExiste.status).toBe(404);

    photoModel.remove.mockRejectedValue(caida());
    const falla = await request(app)
      .delete(`/api/sessions/${ID}/photos/${OTRO_ID}`)
      .set('Authorization', auth);
    expect(falla.status).toBe(500);
  });
});

describe('mensaje manual al cliente', () => {
  test('exige un tipo de mensaje conocido', async () => {
    const res = await request(app)
      .post(`/api/sessions/${ID}/message`)
      .set('Authorization', auth)
      .send({ kind: 'inventado' });

    expect(res.status).toBe(400);
    expect(sessionMessages.sendNow).not.toHaveBeenCalled();
  });

  test('una sesión inexistente responde 404 y un fallo responde 500', async () => {
    sessionMessages.sendNow.mockResolvedValue(null);
    const noExiste = await request(app)
      .post(`/api/sessions/${ID}/message`)
      .set('Authorization', auth)
      .send({ kind: 'recordatorio' });
    expect(noExiste.status).toBe(404);

    sessionMessages.sendNow.mockRejectedValue(caida());
    const falla = await request(app)
      .post(`/api/sessions/${ID}/message`)
      .set('Authorization', auth)
      .send({ kind: 'recordatorio' });
    expect(falla.status).toBe(500);
  });
});

describe('inventario', () => {
  test('una categoría inventada y un color mal escrito se rechazan', async () => {
    const categoria = await request(app).get('/api/materials?category=inventada').set('Authorization', auth);
    expect(categoria.status).toBe(400);

    const color = await request(app)
      .post('/api/materials')
      .set('Authorization', auth)
      .send({ name: 'Tinta', category: 'tintas', colorHex: 'rojo' });
    expect(color.status).toBe(400);
  });

  test('el color vacío borra el color guardado', async () => {
    materialModel.update.mockResolvedValue({ id: ID, color_hex: null });

    const res = await request(app)
      .patch(`/api/materials/${ID}`)
      .set('Authorization', auth)
      .send({ colorHex: '' });

    expect(res.status).toBe(200);
    expect(materialModel.update).toHaveBeenCalledWith(ID, USER_ID, expect.objectContaining({ colorHex: null }));
  });

  test('editar y borrar un insumo inexistente responde 404', async () => {
    materialModel.update.mockResolvedValue(null);
    expect(
      (await request(app).patch(`/api/materials/${ID}`).set('Authorization', auth).send({ name: 'X' })).status
    ).toBe(404);

    materialModel.remove.mockResolvedValue(null);
    expect((await request(app).delete(`/api/materials/${ID}`).set('Authorization', auth)).status).toBe(404);
  });

  test('un ajuste de stock sin cantidad o en un insumo ajeno se rechaza', async () => {
    const sinDelta = await request(app)
      .post(`/api/materials/${ID}/stock`)
      .set('Authorization', auth)
      .send({ delta: 0 });
    expect(sinDelta.status).toBe(400);

    materialModel.adjustStock.mockResolvedValue(null);
    const ajeno = await request(app)
      .post(`/api/materials/${ID}/stock`)
      .set('Authorization', auth)
      .send({ delta: -2 });
    expect(ajeno.status).toBe(404);
  });

  test('cargar los básicos y vaciar el inventario informan sus fallos', async () => {
    materialModel.createDefaults.mockRejectedValue(caida());
    expect((await request(app).post('/api/materials/defaults').set('Authorization', auth)).status).toBe(500);

    const sinConfirmar = await request(app).delete('/api/materials').set('Authorization', auth);
    expect(sinConfirmar.status).toBe(400);

    materialModel.removeAll.mockResolvedValue(3);
    const confirmado = await request(app).delete('/api/materials?confirm=true').set('Authorization', auth);
    expect(confirmado.status).toBe(200);
    expect(confirmado.body.deleted).toBe(3);

    materialModel.listByUser.mockRejectedValue(caida());
    expect((await request(app).get('/api/materials').set('Authorization', auth)).status).toBe(500);
  });
});

describe('cotizaciones', () => {
  test('listar y obtener informan sus fallos', async () => {
    quoteModel.listByUser.mockRejectedValue(caida());
    expect((await request(app).get('/api/quotes').set('Authorization', auth)).status).toBe(500);

    expect((await request(app).get('/api/quotes/no-es-uuid').set('Authorization', auth)).status).toBe(404);

    quoteModel.findByIdForUser.mockResolvedValue(null);
    expect((await request(app).get(`/api/quotes/${ID}`).set('Authorization', auth)).status).toBe(404);

    quoteModel.findByIdForUser.mockRejectedValue(caida());
    expect((await request(app).get(`/api/quotes/${ID}`).set('Authorization', auth)).status).toBe(500);
  });

  test('una referencia que no es del artista se rechaza al editar', async () => {
    projectModel.ownsReference.mockResolvedValue(false);

    const res = await request(app)
      .patch(`/api/quotes/${ID}`)
      .set('Authorization', auth)
      .send({ projectId: OTRO_ID });

    expect(res.status).toBe(400);
    expect(quoteModel.update).not.toHaveBeenCalled();
  });

  test('borrar: id inválido, inexistente y fallo', async () => {
    expect((await request(app).delete('/api/quotes/no-es-uuid').set('Authorization', auth)).status).toBe(404);

    quoteModel.remove.mockResolvedValue(null);
    expect((await request(app).delete(`/api/quotes/${ID}`).set('Authorization', auth)).status).toBe(404);

    quoteModel.remove.mockRejectedValue(caida());
    expect((await request(app).delete(`/api/quotes/${ID}`).set('Authorization', auth)).status).toBe(500);
  });

  test('descontar el stock: ya consumida da 409, inexistente da 404', async () => {
    expect((await request(app).post('/api/quotes/no-es-uuid/consume').set('Authorization', auth)).status).toBe(404);

    quoteModel.consume.mockResolvedValue(null);
    quoteModel.findByIdForUser.mockResolvedValue({ id: ID });
    const yaConsumida = await request(app).post(`/api/quotes/${ID}/consume`).set('Authorization', auth);
    expect(yaConsumida.status).toBe(409);

    quoteModel.findByIdForUser.mockResolvedValue(null);
    const noExiste = await request(app).post(`/api/quotes/${ID}/consume`).set('Authorization', auth);
    expect(noExiste.status).toBe(404);
  });

  test('descontar el stock avisa de los insumos en nivel crítico', async () => {
    quoteModel.consume.mockResolvedValue({ quote: { id: ID }, affected: [{ id: 'm', low: true }] });

    const res = await request(app).post(`/api/quotes/${ID}/consume`).set('Authorization', auth);

    expect(res.status).toBe(200);
    expect(notifyLowStock).toHaveBeenCalledWith(USER_ID, [{ id: 'm', low: true }]);
  });

  test('si el descuento falla responde 500', async () => {
    quoteModel.consume.mockRejectedValue(caida());

    const res = await request(app).post(`/api/quotes/${ID}/consume`).set('Authorization', auth);

    expect(res.status).toBe(500);
  });
});
