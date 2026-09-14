const request = require('supertest');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// Igual que en las demás pruebas: se mockean los modelos y el almacenamiento
// para probar los controladores sin base de datos.
jest.mock('../src/models/clientModel');
jest.mock('../src/models/projectModel');
jest.mock('../src/models/sessionModel');
jest.mock('../src/models/sessionPhotoModel');
jest.mock('../src/services/storage');

const clientModel = require('../src/models/clientModel');
const projectModel = require('../src/models/projectModel');
const sessionModel = require('../src/models/sessionModel');
const photoModel = require('../src/models/sessionPhotoModel');
const storage = require('../src/services/storage');
const app = require('../src/app');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_changeme';
const USER_ID = '11111111-1111-1111-1111-111111111111';
const CLIENT_ID = '33333333-3333-3333-3333-333333333333';
const PROJECT_ID = '44444444-4444-4444-4444-444444444444';
const SESSION_ID = '55555555-5555-5555-5555-555555555555';
const PHOTO_ID = '66666666-6666-6666-6666-666666666666';
const SKETCH_ID = '22222222-2222-2222-2222-222222222222';
const token = jwt.sign({ sub: USER_ID, email: 'demo@estudio.cl' }, JWT_SECRET);
const auth = `Bearer ${token}`;

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

const client = { id: CLIENT_ID, user_id: USER_ID, name: 'Camila Rojas', phone: '+56 9 1234 5678' };
const project = { id: PROJECT_ID, client_id: CLIENT_ID, title: 'Manga irezumi', total_price: 450000 };
const session = { id: SESSION_ID, project_id: PROJECT_ID, starts_at: '2026-09-20T15:00:00.000Z' };

let driverRemove;

beforeEach(() => {
  jest.clearAllMocks();
  storage.name = 'local';
  storage.save.mockResolvedValue({ key: 'sessions/x/y.png', url: 'http://localhost:3000/uploads/sessions/x/y.png' });
  driverRemove = jest.fn().mockResolvedValue(undefined);
  storage.getDriver.mockReturnValue({ remove: driverRemove });
  photoModel.filesFor.mockResolvedValue([]);
});

describe('Clientes', () => {
  test('sin token devuelve 401', (done) => {
    request(app).get('/api/clients').expect(401).end(done);
  });

  test('crea el cliente con los datos saneados', (done) => {
    clientModel.create.mockResolvedValue(client);

    request(app)
      .post('/api/clients')
      .set('Authorization', auth)
      .send({ name: '  Camila Rojas ', phone: '+56 9 1234 5678', instagram: '@camila.ink', email: '' })
      .expect(201)
      .expect(() => {
        expect(clientModel.create).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: USER_ID,
            name: 'Camila Rojas',
            phone: '+56 9 1234 5678',
            instagram: 'camila.ink',
            email: null,
          })
        );
      })
      .end(done);
  });

  test('sin nombre devuelve 400', (done) => {
    request(app)
      .post('/api/clients')
      .set('Authorization', auth)
      .send({ phone: '912345678' })
      .expect(400)
      .expect(() => expect(clientModel.create).not.toHaveBeenCalled())
      .end(done);
  });

  test('un teléfono inválido devuelve 400', (done) => {
    request(app)
      .post('/api/clients')
      .set('Authorization', auth)
      .send({ name: 'Diego', phone: 'llámame' })
      .expect(400)
      .end(done);
  });

  test('la ficha incluye el historial de proyectos del cliente', (done) => {
    clientModel.findByIdForUser.mockResolvedValue(client);
    projectModel.listByUser.mockResolvedValue([project]);

    request(app)
      .get(`/api/clients/${CLIENT_ID}`)
      .set('Authorization', auth)
      .expect(200)
      .expect((res) => {
        expect(projectModel.listByUser).toHaveBeenCalledWith(USER_ID, { clientId: CLIENT_ID });
        expect(res.body.projects).toHaveLength(1);
      })
      .end(done);
  });

  test('un cliente de otro artista devuelve 404', (done) => {
    clientModel.findByIdForUser.mockResolvedValue(null);
    request(app).get(`/api/clients/${CLIENT_ID}`).set('Authorization', auth).expect(404).end(done);
  });

  test('borrar un cliente elimina los archivos de las fotos de sus sesiones', (done) => {
    photoModel.filesFor.mockResolvedValue([
      { storage_driver: 'local', storage_key: 'sessions/x/1.png' },
      { storage_driver: 'local', storage_key: 'sessions/x/2.png' },
    ]);
    clientModel.remove.mockResolvedValue({ id: CLIENT_ID });

    request(app)
      .delete(`/api/clients/${CLIENT_ID}`)
      .set('Authorization', auth)
      .expect(204)
      .expect(() => {
        expect(photoModel.filesFor).toHaveBeenCalledWith('client', CLIENT_ID, USER_ID);
        expect(driverRemove).toHaveBeenCalledTimes(2);
      })
      .end(done);
  });

  test('si el cliente no es suyo no se borra ningún archivo', (done) => {
    photoModel.filesFor.mockResolvedValue([{ storage_driver: 'local', storage_key: 'k' }]);
    clientModel.remove.mockResolvedValue(null);

    request(app)
      .delete(`/api/clients/${CLIENT_ID}`)
      .set('Authorization', auth)
      .expect(404)
      .expect(() => expect(driverRemove).not.toHaveBeenCalled())
      .end(done);
  });
});

describe('Proyectos', () => {
  test('sin cliente devuelve 400', (done) => {
    request(app)
      .post('/api/projects')
      .set('Authorization', auth)
      .send({ title: 'Manga' })
      .expect(400)
      .end(done);
  });

  test('crea el proyecto con precio total', (done) => {
    projectModel.create.mockResolvedValue(project);

    request(app)
      .post('/api/projects')
      .set('Authorization', auth)
      .send({ clientId: CLIENT_ID, title: 'Manga irezumi', totalPrice: 450000 })
      .expect(201)
      .expect(() => {
        expect(projectModel.create).toHaveBeenCalledWith(
          expect.objectContaining({ userId: USER_ID, clientId: CLIENT_ID, totalPrice: 450000 })
        );
      })
      .end(done);
  });

  test('un cliente ajeno devuelve 400', (done) => {
    projectModel.create.mockResolvedValue(null);

    request(app)
      .post('/api/projects')
      .set('Authorization', auth)
      .send({ clientId: CLIENT_ID, title: 'Manga' })
      .expect(400)
      .end(done);
  });

  test('un precio con decimales o negativo devuelve 400', (done) => {
    request(app)
      .post('/api/projects')
      .set('Authorization', auth)
      .send({ clientId: CLIENT_ID, title: 'Manga', totalPrice: -10.5 })
      .expect(400)
      .expect(() => expect(projectModel.create).not.toHaveBeenCalled())
      .end(done);
  });

  test('no se puede enlazar un boceto de otro artista', (done) => {
    projectModel.ownsReference.mockResolvedValue(false);

    request(app)
      .patch(`/api/projects/${PROJECT_ID}`)
      .set('Authorization', auth)
      .send({ sketchId: SKETCH_ID })
      .expect(400)
      .expect(() => expect(projectModel.update).not.toHaveBeenCalled())
      .end(done);
  });

  test('enlaza la previsualización 3D del proyecto', (done) => {
    projectModel.ownsReference.mockResolvedValue(true);
    projectModel.update.mockResolvedValue({ ...project, preview_id: SKETCH_ID });

    request(app)
      .patch(`/api/projects/${PROJECT_ID}`)
      .set('Authorization', auth)
      .send({ previewId: SKETCH_ID })
      .expect(200)
      .expect(() => {
        expect(projectModel.ownsReference).toHaveBeenCalledWith('preview', SKETCH_ID, USER_ID);
        expect(projectModel.update).toHaveBeenCalledWith(
          PROJECT_ID,
          USER_ID,
          expect.objectContaining({ previewId: SKETCH_ID })
        );
      })
      .end(done);
  });

  test('el detalle trae las sesiones con sus fotos', (done) => {
    projectModel.findByIdForUser.mockResolvedValue(project);
    sessionModel.listByProject.mockResolvedValue([{ ...session, photos: [] }]);

    request(app)
      .get(`/api/projects/${PROJECT_ID}`)
      .set('Authorization', auth)
      .expect(200)
      .expect((res) => expect(res.body.sessions).toHaveLength(1))
      .end(done);
  });
});

describe('Sesiones', () => {
  test('listar sin rango de fechas devuelve 400', (done) => {
    request(app).get('/api/sessions').set('Authorization', auth).expect(400).end(done);
  });

  test('lista las citas del rango', (done) => {
    sessionModel.listByUser.mockResolvedValue([]);

    request(app)
      .get('/api/sessions?from=2026-09-01T03:00:00.000Z&to=2026-10-01T03:00:00.000Z')
      .set('Authorization', auth)
      .expect(200)
      .expect(() => {
        expect(sessionModel.listByUser).toHaveBeenCalledWith(USER_ID, {
          from: '2026-09-01T03:00:00.000Z',
          to: '2026-10-01T03:00:00.000Z',
        });
      })
      .end(done);
  });

  test('agendar sin fecha devuelve 400', (done) => {
    request(app)
      .post('/api/sessions')
      .set('Authorization', auth)
      .send({ projectId: PROJECT_ID, price: 150000 })
      .expect(400)
      .expect(() => expect(sessionModel.create).not.toHaveBeenCalled())
      .end(done);
  });

  test('agenda la sesión con lo que se cobra en ella', (done) => {
    sessionModel.create.mockResolvedValue(session);

    request(app)
      .post('/api/sessions')
      .set('Authorization', auth)
      .send({
        projectId: PROJECT_ID,
        startsAt: '2026-09-20T12:00:00-03:00',
        durationMinutes: 180,
        price: 150000,
      })
      .expect(201)
      .expect((res) => {
        expect(sessionModel.create).toHaveBeenCalledWith(
          expect.objectContaining({
            projectId: PROJECT_ID,
            startsAt: '2026-09-20T15:00:00.000Z',
            durationMinutes: 180,
            price: 150000,
          })
        );
        expect(res.body.session.photos).toEqual([]);
      })
      .end(done);
  });

  test('cancelar una sesión la actualiza', (done) => {
    sessionModel.update.mockResolvedValue({ ...session, status: 'cancelada' });

    request(app)
      .patch(`/api/sessions/${SESSION_ID}`)
      .set('Authorization', auth)
      .send({ status: 'cancelada' })
      .expect(200)
      .expect(() => {
        expect(sessionModel.update).toHaveBeenCalledWith(
          SESSION_ID,
          USER_ID,
          expect.objectContaining({ status: 'cancelada' })
        );
      })
      .end(done);
  });

  test('un estado de pago que no es booleano devuelve 400', (done) => {
    request(app)
      .patch(`/api/sessions/${SESSION_ID}`)
      .set('Authorization', auth)
      .send({ paid: 'sí' })
      .expect(400)
      .end(done);
  });

  test('sube una foto del avance a la carpeta de sesiones', (done) => {
    sessionModel.findByIdForUser.mockResolvedValue(session);
    photoModel.create.mockResolvedValue({ id: PHOTO_ID, session_id: SESSION_ID });

    request(app)
      .post(`/api/sessions/${SESSION_ID}/photos`)
      .set('Authorization', auth)
      .attach('image', PNG_1X1, { filename: 'avance.png', contentType: 'image/png' })
      .field('caption', 'Línea terminada')
      .expect(201)
      .expect(() => {
        expect(storage.save).toHaveBeenCalledWith(
          expect.objectContaining({ userId: USER_ID, folder: 'sessions' })
        );
        expect(photoModel.create).toHaveBeenCalledWith(
          expect.objectContaining({
            sessionId: SESSION_ID,
            caption: 'Línea terminada',
            storageKey: 'sessions/x/y.png',
          })
        );
      })
      .end(done);
  });

  test('una sesión ajena devuelve 404 sin subir el archivo', (done) => {
    sessionModel.findByIdForUser.mockResolvedValue(null);

    request(app)
      .post(`/api/sessions/${SESSION_ID}/photos`)
      .set('Authorization', auth)
      .attach('image', PNG_1X1, { filename: 'avance.png', contentType: 'image/png' })
      .expect(404)
      .expect(() => expect(storage.save).not.toHaveBeenCalled())
      .end(done);
  });

  test('borrar una foto elimina el archivo con su driver', (done) => {
    photoModel.remove.mockResolvedValue({
      id: PHOTO_ID,
      storage_driver: 'local',
      storage_key: 'sessions/x/y.png',
    });

    request(app)
      .delete(`/api/sessions/${SESSION_ID}/photos/${PHOTO_ID}`)
      .set('Authorization', auth)
      .expect(204)
      .expect(() => {
        expect(storage.getDriver).toHaveBeenCalledWith('local');
        expect(driverRemove).toHaveBeenCalledWith('sessions/x/y.png');
      })
      .end(done);
  });
});
