/**
 * Reglas de análisis estático del backend.
 *
 *   npx eslint .            (dentro del contenedor: ver CLAUDE.md)
 *
 * Se parte de las reglas recomendadas de ESLint, que son las que detectan
 * errores reales —variables sin declarar, código inalcanzable, promesas mal
 * usadas— y no cuestiones de estilo. El formato no se discute aquí: no aporta
 * nada a la calidad y sí genera ruido.
 */
const js = require('@eslint/js');

/** Globales de Node y de Jest, que ESLint no conoce por su cuenta. */
const globalesNode = {
  require: 'readonly',
  module: 'writable',
  exports: 'writable',
  process: 'readonly',
  console: 'readonly',
  Buffer: 'readonly',
  __dirname: 'readonly',
  __filename: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  setImmediate: 'readonly',
  URL: 'readonly',
  fetch: 'readonly',
  AbortSignal: 'readonly',
  FormData: 'readonly',
  Blob: 'readonly',
  performance: 'readonly',
  structuredClone: 'readonly',
};

const globalesJest = {
  describe: 'readonly',
  test: 'readonly',
  expect: 'readonly',
  beforeAll: 'readonly',
  beforeEach: 'readonly',
  afterAll: 'readonly',
  afterEach: 'readonly',
  jest: 'readonly',
  global: 'readonly',
};

module.exports = [
  { ignores: ['node_modules/**', 'coverage/**', 'uploads/**'] },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'commonjs',
      globals: globalesNode,
    },
    rules: {
      ...js.configs.recommended.rules,
      // El guion bajo delante es la forma habitual de decir «esto se descarta
      // a propósito», sobre todo al desarmar un objeto para quitarle un campo.
      'no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
    },
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: { globals: { ...globalesNode, ...globalesJest } },
  },
];
