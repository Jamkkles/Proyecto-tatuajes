/**
 * Dos baterías en una sola corrida:
 *
 *  - «unitarias»: las de siempre. Sustituyen los modelos por dobles, así que
 *    corren sin base de datos.
 *  - «integracion»: ejercitan los modelos contra un PostgreSQL de verdad, en
 *    una base aparte (`tatuajes_test`) que se crea sola. Son las que cubren la
 *    capa de SQL, que con dobles nunca llega a ejecutarse.
 *
 * Conviene correrlas con --runInBand: la batería de integración vacía las
 * tablas entre pruebas y dos archivos en paralelo se pisarían.
 */
module.exports = {
  projects: [
    {
      displayName: 'unitarias',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/*.test.js'],
      setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
    },
    {
      displayName: 'integracion',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/integracion/*.test.js'],
      setupFiles: ['<rootDir>/tests/integracion/env.js'],
      globalSetup: '<rootDir>/tests/integracion/prepararBase.js',
      setupFilesAfterEnv: ['<rootDir>/tests/integracion/limpiar.js'],
    },
  ],
  // Los scripts de `src/db` son utilidades de consola que se ejecutan a mano
  // (db:init, admin:create): no forman parte del servicio y quedan fuera del
  // indicador de cobertura.
  collectCoverageFrom: ['src/**/*.js', '!src/db/**'],
};
