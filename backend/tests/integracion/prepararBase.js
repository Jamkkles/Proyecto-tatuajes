/**
 * Crea la base de pruebas si no existe y le aplica el esquema. Corre una sola
 * vez por corrida, antes que cualquier archivo de prueba.
 *
 * El esquema es el mismo `schema.sql` del proyecto, que está escrito para poder
 * aplicarse muchas veces sobre la misma base, así que basta con correrlo.
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { urlAdministracion, urlPruebas, NOMBRE_PRUEBAS } = require('./urlBase');

const ESQUEMA = path.join(__dirname, '..', '..', 'src', 'db', 'schema.sql');

module.exports = async function prepararBase() {
  const admin = new Client({ connectionString: urlAdministracion() });
  await admin.connect();
  try {
    const { rows } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      NOMBRE_PRUEBAS,
    ]);
    // El nombre no viene del usuario sino de esta configuración, y CREATE
    // DATABASE no admite parámetros.
    if (rows.length === 0) await admin.query(`CREATE DATABASE "${NOMBRE_PRUEBAS}"`);
  } finally {
    await admin.end();
  }

  const base = new Client({ connectionString: urlPruebas() });
  await base.connect();
  try {
    await base.query(fs.readFileSync(ESQUEMA, 'utf8'));
  } finally {
    await base.end();
  }
};
