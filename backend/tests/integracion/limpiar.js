/**
 * Deja la base vacía antes de cada prueba, para que ninguna dependa de lo que
 * dejó la anterior.
 *
 * El primer `beforeAll` comprueba que la base conectada sea realmente la de
 * pruebas: vaciar tablas es irreversible y esta es la única barrera entre un
 * DATABASE_URL mal puesto y los datos de desarrollo.
 */
const pool = require('../../src/config/db');
const { NOMBRE_PRUEBAS } = require('./urlBase');

let tablas = null;

beforeAll(async () => {
  const { rows } = await pool.query('SELECT current_database() AS base');
  if (rows[0].base !== NOMBRE_PRUEBAS) {
    throw new Error(
      `Las pruebas de integración están conectadas a «${rows[0].base}» y esperaban «${NOMBRE_PRUEBAS}». No se vacía nada.`
    );
  }
  const { rows: t } = await pool.query(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename"
  );
  tablas = t.map((r) => `"${r.tablename}"`).join(', ');
});

beforeEach(async () => {
  if (tablas) await pool.query(`TRUNCATE TABLE ${tablas} RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  await pool.end();
});
