/**
 * Capa de almacenamiento de archivos.
 *
 * El driver local se prueba escribiendo de verdad, en una carpeta temporal que
 * se borra al terminar. El de nube se prueba con el SDK de Cloudinary
 * sustituido por un doble: lo que interesa es que el contrato se cumpla
 * (carpeta por artista, clave que sirve para borrar) sin necesitar una cuenta.
 */
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

const UPLOAD_DIR = path.join(os.tmpdir(), `uploads-prueba-${process.pid}`);
process.env.UPLOAD_DIR = UPLOAD_DIR;
process.env.PUBLIC_URL = 'http://localhost:3000';

const localDriver = require('../src/services/storage/localDriver');
const storage = require('../src/services/storage');
const { removeFiles } = require('../src/services/storage/removeFiles');

// El doble del SDK de Cloudinary. jest.mock se iza al principio del archivo, así
// que las variables que usa su fábrica tienen que empezar por "mock".
const mockSubidas = [];
let mockDestruido = null;

jest.mock('cloudinary', () => ({
  v2: {
    config: jest.fn(),
    url: jest.fn((key) => `https://res.cloudinary.com/demo/${key}`),
    uploader: {
      upload_stream: jest.fn((opciones, callback) => ({
        end: (buffer) => {
          mockSubidas.push({ opciones, buffer });
          callback(null, {
            public_id: `${opciones.folder}/abc123`,
            secure_url: `https://res.cloudinary.com/demo/${opciones.folder}/abc123.png`,
          });
        },
      })),
      destroy: jest.fn(async (key) => {
        mockDestruido = key;
        return { result: 'ok' };
      }),
    },
  },
}));

const USER_ID = '11111111-1111-1111-1111-111111111111';
const contenido = Buffer.from('imagen de prueba');

afterAll(async () => {
  await fs.rm(UPLOAD_DIR, { recursive: true, force: true });
});

describe('driver local', () => {
  test('guarda el archivo separado por artista y devuelve su URL', async () => {
    const { key, url } = await localDriver.save({
      buffer: contenido,
      mimeType: 'image/png',
      userId: USER_ID,
    });

    expect(key).toMatch(new RegExp(`^sketches/${USER_ID}/[0-9a-f-]+\\.png$`));
    expect(url).toBe(`http://localhost:3000/uploads/${key}`);
    await expect(fs.readFile(path.join(UPLOAD_DIR, key))).resolves.toEqual(contenido);
  });

  test('las fotos de sesión van a su propia carpeta', async () => {
    const { key } = await localDriver.save({
      buffer: contenido,
      mimeType: 'image/jpeg',
      userId: USER_ID,
      folder: 'sessions',
    });

    expect(key.startsWith(`sessions/${USER_ID}/`)).toBe(true);
    expect(key.endsWith('.jpg')).toBe(true);
  });

  test('un tipo desconocido se guarda igual, con extensión genérica', async () => {
    const { key } = await localDriver.save({
      buffer: contenido,
      mimeType: 'application/octet-stream',
      userId: USER_ID,
    });

    expect(key.endsWith('.bin')).toBe(true);
  });

  test('vuelve a leer lo guardado y devuelve null si ya no está', async () => {
    const { key } = await localDriver.save({
      buffer: contenido,
      mimeType: 'image/webp',
      userId: USER_ID,
    });

    expect(await localDriver.read(key)).toEqual(contenido);
    expect(await localDriver.read('sketches/no/existe.png')).toBeNull();
  });

  test('borrar un archivo que ya no está no es un error', async () => {
    const { key } = await localDriver.save({
      buffer: contenido,
      mimeType: 'image/png',
      userId: USER_ID,
    });

    await localDriver.remove(key);
    expect(await localDriver.read(key)).toBeNull();
    await expect(localDriver.remove(key)).resolves.toBeUndefined();
  });
});

describe('selector de driver', () => {
  test('el driver activo por defecto es el local', () => {
    expect(storage.name).toBe('local');
  });

  test('se puede pedir un driver por nombre', () => {
    expect(storage.getDriver('local').name).toBe('local');
    expect(storage.getDriver('cloudinary').name).toBe('cloudinary');
  });

  test('un nombre desconocido falla con las opciones válidas', () => {
    expect(() => storage.getDriver('ftp')).toThrow(/local, cloudinary/);
  });
});

describe('removeFiles', () => {
  test('borra cada archivo con el driver con que se subió', async () => {
    const uno = await localDriver.save({ buffer: contenido, mimeType: 'image/png', userId: USER_ID });
    const otro = await localDriver.save({ buffer: contenido, mimeType: 'image/png', userId: USER_ID });

    await removeFiles([
      { storage_driver: 'local', storage_key: uno.key },
      { storage_driver: 'local', storage_key: otro.key },
    ]);

    expect(await localDriver.read(uno.key)).toBeNull();
    expect(await localDriver.read(otro.key)).toBeNull();
  });

  test('un archivo que no se puede borrar no interrumpe a los demás', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    const bueno = await localDriver.save({ buffer: contenido, mimeType: 'image/png', userId: USER_ID });

    await removeFiles([
      { storage_driver: 'driver-inventado', storage_key: 'x' },
      { storage_driver: 'local', storage_key: bueno.key },
    ]);

    expect(await localDriver.read(bueno.key)).toBeNull();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});

describe('driver de nube', () => {
  const conCredenciales = () => {
    process.env.CLOUDINARY_CLOUD_NAME = 'demo';
    process.env.CLOUDINARY_API_KEY = 'llave';
    process.env.CLOUDINARY_API_SECRET = 'secreto';
  };

  beforeEach(() => {
    jest.resetModules();
    mockSubidas.length = 0;
    mockDestruido = null;
    delete process.env.CLOUDINARY_CLOUD_NAME;
    delete process.env.CLOUDINARY_API_KEY;
    delete process.env.CLOUDINARY_API_SECRET;
  });

  test('sin credenciales avisa cuáles faltan en vez de intentar subir', async () => {
    const driver = require('../src/services/storage/cloudinaryDriver');
    // Falla antes de intentar nada: la comprobación es lo primero que hace.
    expect(() => driver.save({ buffer: contenido, userId: USER_ID, mimeType: 'image/png' })).toThrow(
      /CLOUDINARY_CLOUD_NAME/
    );
  });

  test('sube a una carpeta por artista y devuelve la clave que sirve para borrar', async () => {
    conCredenciales();
    const driver = require('../src/services/storage/cloudinaryDriver');

    const { key, url } = await driver.save({ buffer: contenido, userId: USER_ID, mimeType: 'image/png' });

    expect(mockSubidas[0].opciones.folder).toBe(`tatuajes/sketches/${USER_ID}`);
    expect(mockSubidas[0].buffer).toEqual(contenido);
    expect(key).toContain(USER_ID);
    expect(url).toMatch(/^https:\/\//);
  });

  test('las fotos de sesión quedan en una carpeta hermana', async () => {
    conCredenciales();
    const driver = require('../src/services/storage/cloudinaryDriver');

    await driver.save({ buffer: contenido, userId: USER_ID, folder: 'sessions' });

    expect(mockSubidas[0].opciones.folder).toBe(`tatuajes/sessions/${USER_ID}`);
  });

  test('un fallo de la subida se propaga', async () => {
    conCredenciales();
    const cloudinary = require('cloudinary');
    cloudinary.v2.uploader.upload_stream.mockImplementationOnce((_opciones, callback) => ({
      end: () => callback(new Error('cuota agotada')),
    }));
    const driver = require('../src/services/storage/cloudinaryDriver');

    await expect(driver.save({ buffer: contenido, userId: USER_ID })).rejects.toThrow('cuota agotada');
  });

  test('borrar llama a destroy con la clave guardada', async () => {
    conCredenciales();
    const driver = require('../src/services/storage/cloudinaryDriver');

    await driver.remove('tatuajes/sketches/abc');

    expect(mockDestruido).toBe('tatuajes/sketches/abc');
  });

  test('leer baja la imagen por su URL pública y devuelve null si no está', async () => {
    conCredenciales();
    const driver = require('../src/services/storage/cloudinaryDriver');

    global.fetch = jest.fn(async () => ({
      ok: true,
      arrayBuffer: async () => contenido.buffer.slice(0),
    }));
    expect(Buffer.isBuffer(await driver.read('clave'))).toBe(true);

    global.fetch = jest.fn(async () => ({ ok: false }));
    expect(await driver.read('clave')).toBeNull();
  });
});
