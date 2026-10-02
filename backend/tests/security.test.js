const express = require('express');
const request = require('supertest');
const cors = require('cors');

const { loadJwtSecret } = require('../src/config/jwt');
const { buildPoolConfig } = require('../src/config/dbConfig');
const {
  corsOptions,
  registrationOpen,
  createAuthLimiter,
  trustProxy,
} = require('../src/middleware/security');

describe('secreto de sesión (JWT)', () => {
  const FUERTE = 'a'.repeat(40);

  test('en desarrollo sirve el valor por defecto', () => {
    expect(loadJwtSecret({})).toBeTruthy();
  });

  test.each([
    ['sin definir', {}],
    ['el de desarrollo', { JWT_SECRET: 'dev_secret_changeme' }],
    ['el de ejemplo', { JWT_SECRET: 'cambia_este_secreto_en_produccion' }],
    ['demasiado corto', { JWT_SECRET: 'corto' }],
  ])('en producción se niega a arrancar con un secreto %s', (_, env) => {
    expect(() => loadJwtSecret({ NODE_ENV: 'production', ...env })).toThrow(/JWT_SECRET/);
  });

  test('en producción acepta uno largo', () => {
    expect(loadJwtSecret({ NODE_ENV: 'production', JWT_SECRET: FUERTE })).toBe(FUERTE);
  });
});

describe('CORS', () => {
  test('en desarrollo acepta cualquier origen', () => {
    expect(corsOptions({}).origin).toBe(true);
  });

  test('en producción sin CORS_ORIGIN no acepta ninguno', () => {
    expect(corsOptions({ NODE_ENV: 'production' }).origin).toBe(false);
  });

  test('acepta varios orígenes y limpia espacios y barras finales', () => {
    const { origin } = corsOptions({
      CORS_ORIGIN: ' https://app.pages.dev/ , http://localhost:5173 ',
    });
    expect(origin).toEqual(['https://app.pages.dev', 'http://localhost:5173']);
  });

  // La prueba que importa: lo que el navegador ve de verdad.
  describe('en una app real', () => {
    const app = express();
    app.use(cors(corsOptions({ NODE_ENV: 'production', CORS_ORIGIN: 'https://app.pages.dev' })));
    app.get('/x', (req, res) => res.json({ ok: true }));

    test('el origen permitido recibe la cabecera', async () => {
      const res = await request(app).get('/x').set('Origin', 'https://app.pages.dev');
      expect(res.headers['access-control-allow-origin']).toBe('https://app.pages.dev');
    });

    test('otro origen no la recibe', async () => {
      const res = await request(app).get('/x').set('Origin', 'https://malo.example');
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    test('la petición de permiso admite Authorization y PATCH', async () => {
      const res = await request(app)
        .options('/x')
        .set('Origin', 'https://app.pages.dev')
        .set('Access-Control-Request-Method', 'PATCH')
        .set('Access-Control-Request-Headers', 'authorization,content-type');
      expect(res.headers['access-control-allow-methods']).toMatch(/PATCH/);
      expect(res.headers['access-control-allow-headers']).toMatch(/authorization/i);
      expect(res.headers['access-control-max-age']).toBe('86400');
    });
  });
});

describe('registro de cuentas', () => {
  test('abierto en desarrollo, cerrado en producción', () => {
    expect(registrationOpen({})).toBe(true);
    expect(registrationOpen({ NODE_ENV: 'production' })).toBe(false);
  });

  test('ALLOW_REGISTER manda sobre el entorno', () => {
    expect(registrationOpen({ NODE_ENV: 'production', ALLOW_REGISTER: 'true' })).toBe(true);
    expect(registrationOpen({ ALLOW_REGISTER: 'false' })).toBe(false);
  });

  test('con el registro cerrado la API responde 403 y no toca la base', async () => {
    jest.resetModules();
    jest.doMock('../src/models/userModel');
    process.env.ALLOW_REGISTER = 'false';
    try {
      const userModel = require('../src/models/userModel');
      const app = require('../src/app');
      const res = await request(app)
        .post('/api/auth/register')
        .send({ name: 'X', email: 'x@y.cl', password: 'una-clave-larga' });
      expect(res.status).toBe(403);
      expect(userModel.findByEmail).not.toHaveBeenCalled();
    } finally {
      delete process.env.ALLOW_REGISTER;
      jest.dontMock('../src/models/userModel');
    }
  });
});

describe('límite de intentos', () => {
  test('a partir del tope responde 429 con un mensaje legible', async () => {
    const previo = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development'; // el límite se salta en `test`
    try {
      const app = express();
      app.use(createAuthLimiter({ max: 2 }));
      app.post('/login', (req, res) => res.json({ ok: true }));

      expect((await request(app).post('/login')).status).toBe(200);
      expect((await request(app).post('/login')).status).toBe(200);
      const bloqueado = await request(app).post('/login');
      expect(bloqueado.status).toBe(429);
      expect(bloqueado.body.message).toMatch(/Demasiados intentos/);
    } finally {
      process.env.NODE_ENV = previo;
    }
  });
});

describe('proxy de confianza', () => {
  test('un salto en producción, ninguno en desarrollo', () => {
    expect(trustProxy({ NODE_ENV: 'production' })).toBe(1);
    expect(trustProxy({})).toBe(false);
  });

  test('TRUST_PROXY lo fija, y un valor raro no abre la puerta', () => {
    expect(trustProxy({ TRUST_PROXY: '2' })).toBe(2);
    expect(trustProxy({ NODE_ENV: 'production', TRUST_PROXY: 'true' })).toBe(false);
  });
});

describe('opciones del pool de base de datos', () => {
  test('espera lo bastante para una base que despierta', () => {
    const c = buildPoolConfig({ DATABASE_URL: 'postgresql://x' });
    expect(c.connectionString).toBe('postgresql://x');
    expect(c.connectionTimeoutMillis).toBeGreaterThanOrEqual(10_000);
    expect(c.idleTimeoutMillis).toBeLessThanOrEqual(30_000);
  });

  test('TLS solo si se pide', () => {
    expect(buildPoolConfig({}).ssl).toBeUndefined();
    expect(buildPoolConfig({ DATABASE_SSL: 'true' }).ssl).toEqual({ rejectUnauthorized: true });
  });
});
