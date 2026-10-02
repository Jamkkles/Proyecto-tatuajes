// Inicializa la base de datos: crea las tablas y siembra un usuario de prueba.
// Uso: npm run db:init
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const pool = require('../config/db');

// Credenciales del usuario de prueba: se leen del entorno (.env) para no
// exponer datos personales en el código fuente.
const SEED_USER = {
  name: process.env.SEED_NAME || 'Artista Demo',
  email: process.env.SEED_EMAIL || 'demo@estudio.cl',
  password: process.env.SEED_PASSWORD || 'cambia-esta-clave',
};

// ¿La base es la de desarrollo (este equipo o el contenedor de Docker)?
function isLocalDatabase(url = process.env.DATABASE_URL) {
  try {
    return ['localhost', '127.0.0.1', '::1', 'postgres'].includes(new URL(url).hostname);
  } catch {
    return true;
  }
}

// Sembrar `cambia-esta-clave` en una base de internet deja la puerta abierta con
// una contraseña que está en el repositorio. En local no importa; en la nube sí.
function assertSeedIsSafe() {
  if (isLocalDatabase()) return;
  const weak = SEED_USER.password === 'cambia-esta-clave' || SEED_USER.password.length < 10;
  if (weak) {
    throw new Error(
      'La base no es local y SEED_PASSWORD es la de ejemplo o tiene menos de 10 caracteres. ' +
        'Define SEED_EMAIL y SEED_PASSWORD con tus datos reales.'
    );
  }
}

async function main() {
  assertSeedIsSafe();
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(schema);
  console.log('✓ Esquema aplicado');

  const hash = await bcrypt.hash(SEED_USER.password, 10);
  const result = await pool.query(
    `INSERT INTO users (name, email, password_hash)
     VALUES ($1, $2, $3)
     ON CONFLICT (email) DO NOTHING
     RETURNING id`,
    [SEED_USER.name, SEED_USER.email, hash]
  );

  if (result.rowCount > 0) {
    console.log('✓ Usuario de prueba creado (credenciales en SEED_EMAIL / SEED_PASSWORD)');
  } else {
    console.log('• El usuario de prueba ya existía, sin cambios');
  }
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error('✗ Error inicializando la base de datos:', err.message);
    pool.end();
    process.exit(1);
  });
