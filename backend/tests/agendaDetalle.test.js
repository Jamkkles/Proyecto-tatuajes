/**
 * Las pantallas de detalle de la agenda: la ficha del cliente con sus
 * proyectos y la ficha del proyecto con sus sesiones y fotos.
 *
 * Son las dos vistas donde el artista pasa más tiempo y las únicas que arman
 * su respuesta juntando dos consultas, así que lo que se comprueba aquí es que
 * las dos partes salgan y que ambas filtren por el dueño.
 */
const request = require('supertest');
const jwt = require('jsonwebtoken');
require('dotenv').config();

jest.mock('../src/models/clientModel');
jest.mock('../src/models/projectModel');
jest.mock('../src/models/sessionModel');
jest.mock('../src/models/sessionPhotoModel');
jest.mock('../src/services/storage');

const clientModel = require('../src/models/clientModel');
const projectModel = require('../src/models/projectModel');
const sessionModel = require('../src/models/sessionModel');
const app = require('../src/app');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_changeme';
const USER_ID = '11111111-1111-1111-1111-111111111111';
const CLIENT_ID = '22222222-2222-2222-2222-222222222222';
const PROJECT_ID = '33333333-3333-3333-3333-333333333333';
const token = jwt.sign({ sub: USER_ID, email: 'demo@estudio.cl' }, JWT_SECRET);
const auth = `Bearer ${token}`;

const cliente = {
  id: CLIENT_ID,
  user_id: USER_ID,
  name: 'Ana',
  phone: '+56911112222',
  projects_count: 1,
  rating_avg: 4.5,
  rating_count: 2,
};

const proyecto = {
  id: PROJECT_ID,
  user_id: USER_ID,
  client_id: CLIENT_ID,
  title: 'Dragón',
  client_name: 'Ana',
  planned_amount: 180000,
  paid_amount: 100000,
  sessions_count: 2,
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/clients/:id', () => {
  test('devuelve la ficha con los proyectos del cliente', async () => {
    clientModel.findByIdForUser.mockResolvedValue(cliente);
    projectModel.listByUser.mockResolvedValue([proyecto]);

    const res = await request(app).get(`/api/clients/${CLIENT_ID}`).set('Authorization', auth);

    expect(res.status).toBe(200);
    expect(res.body.client.name).toBe('Ana');
    expect(res.body.projects).toHaveLength(1);
    // Los proyectos se piden filtrados por artista y por cliente, no solo por cliente.
    expect(projectModel.listByUser).toHaveBeenCalledWith(USER_ID, { clientId: CLIENT_ID });
  });

  test('un id que no es uuid responde 404 sin consultar', async () => {
    const res = await request(app).get('/api/clients/no-es-uuid').set('Authorization', auth);

    expect(res.status).toBe(404);
    expect(clientModel.findByIdForUser).not.toHaveBeenCalled();
  });

  test('el cliente de otro artista responde 404 y no lista sus proyectos', async () => {
    clientModel.findByIdForUser.mockResolvedValue(null);

    const res = await request(app).get(`/api/clients/${CLIENT_ID}`).set('Authorization', auth);

    expect(res.status).toBe(404);
    expect(projectModel.listByUser).not.toHaveBeenCalled();
  });

  test('sin sesión responde 401', async () => {
    const res = await request(app).get(`/api/clients/${CLIENT_ID}`);
    expect(res.status).toBe(401);
  });

  test('un fallo de la base responde 500', async () => {
    clientModel.findByIdForUser.mockRejectedValue(new Error('db caída'));

    const res = await request(app).get(`/api/clients/${CLIENT_ID}`).set('Authorization', auth);

    expect(res.status).toBe(500);
    expect(res.body.message).not.toMatch(/db caída/);
  });
});

describe('GET /api/clients', () => {
  test('pasa el texto de búsqueda tal cual', async () => {
    clientModel.listByUser.mockResolvedValue([cliente]);

    const res = await request(app).get('/api/clients?q=ana').set('Authorization', auth);

    expect(res.status).toBe(200);
    expect(clientModel.listByUser).toHaveBeenCalledWith(USER_ID, { q: 'ana' });
  });

  test('un fallo al listar responde 500', async () => {
    clientModel.listByUser.mockRejectedValue(new Error('db caída'));

    const res = await request(app).get('/api/clients').set('Authorization', auth);

    expect(res.status).toBe(500);
  });
});

describe('GET /api/projects/:id', () => {
  test('devuelve el proyecto con sus sesiones', async () => {
    projectModel.findByIdForUser.mockResolvedValue(proyecto);
    sessionModel.listByProject.mockResolvedValue([{ id: 'una', photos: [] }]);

    const res = await request(app).get(`/api/projects/${PROJECT_ID}`).set('Authorization', auth);

    expect(res.status).toBe(200);
    expect(res.body.project.title).toBe('Dragón');
    expect(res.body.sessions).toHaveLength(1);
    expect(sessionModel.listByProject).toHaveBeenCalledWith(PROJECT_ID, USER_ID);
  });

  test('un id que no es uuid responde 404', async () => {
    const res = await request(app).get('/api/projects/no-es-uuid').set('Authorization', auth);

    expect(res.status).toBe(404);
    expect(projectModel.findByIdForUser).not.toHaveBeenCalled();
  });

  test('el proyecto de otro artista responde 404 y no lista sus sesiones', async () => {
    projectModel.findByIdForUser.mockResolvedValue(null);

    const res = await request(app).get(`/api/projects/${PROJECT_ID}`).set('Authorization', auth);

    expect(res.status).toBe(404);
    expect(sessionModel.listByProject).not.toHaveBeenCalled();
  });

  test('un fallo de la base responde 500', async () => {
    projectModel.findByIdForUser.mockRejectedValue(new Error('db caída'));

    const res = await request(app).get(`/api/projects/${PROJECT_ID}`).set('Authorization', auth);

    expect(res.status).toBe(500);
  });
});

describe('GET /api/projects', () => {
  test('filtra por cliente y por estado', async () => {
    projectModel.listByUser.mockResolvedValue([proyecto]);

    const res = await request(app)
      .get(`/api/projects?clientId=${CLIENT_ID}&status=activo`)
      .set('Authorization', auth);

    expect(res.status).toBe(200);
    expect(projectModel.listByUser).toHaveBeenCalledWith(USER_ID, {
      clientId: CLIENT_ID,
      status: 'activo',
    });
  });

  test('rechaza un cliente que no es un identificador válido', async () => {
    const res = await request(app).get('/api/projects?clientId=cualquiera').set('Authorization', auth);

    expect(res.status).toBe(400);
    expect(projectModel.listByUser).not.toHaveBeenCalled();
  });

  test('rechaza un estado inventado', async () => {
    const res = await request(app).get('/api/projects?status=inventado').set('Authorization', auth);

    expect(res.status).toBe(400);
    expect(projectModel.listByUser).not.toHaveBeenCalled();
  });

  test('un fallo al listar responde 500', async () => {
    projectModel.listByUser.mockRejectedValue(new Error('db caída'));

    const res = await request(app).get('/api/projects').set('Authorization', auth);

    expect(res.status).toBe(500);
  });
});

describe('referencias ajenas al crear o editar un proyecto', () => {
  test('rechaza un boceto que no es del artista', async () => {
    projectModel.ownsReference.mockResolvedValue(false);

    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', auth)
      .send({ clientId: CLIENT_ID, title: 'Con boceto ajeno', sketchId: PROJECT_ID });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/boceto/i);
    expect(projectModel.create).not.toHaveBeenCalled();
  });

  test('rechaza una escena que no es del artista', async () => {
    projectModel.ownsReference.mockResolvedValue(false);

    const res = await request(app)
      .patch(`/api/projects/${PROJECT_ID}`)
      .set('Authorization', auth)
      .send({ previewId: CLIENT_ID });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/previsualización/i);
    expect(projectModel.update).not.toHaveBeenCalled();
  });

  test('el cliente tiene que venir y ser válido', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', auth)
      .send({ title: 'Sin cliente' });

    expect(res.status).toBe(400);
    expect(projectModel.create).not.toHaveBeenCalled();
  });

  test('si el cliente no es del artista no se crea el proyecto', async () => {
    projectModel.create.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', auth)
      .send({ clientId: CLIENT_ID, title: 'De un cliente ajeno' });

    expect(res.status).toBe(400);
  });
});
