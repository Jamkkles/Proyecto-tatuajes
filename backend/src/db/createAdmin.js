/**
 * Crea el administrador de la plataforma, o convierte en administrador una cuenta que ya
 * existe con ese correo. No hay forma de hacerlo desde la API: un administrador solo nace
 * aquí, con acceso a la base.
 *
 *   ADMIN_EMAIL=tu@correo.cl ADMIN_NAME="Tu Nombre" ADMIN_PASSWORD='…' npm run admin:create
 *
 * Contra la base de la nube, igual que `db:init`, pasando DATABASE_URL.
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('../config/db');

const MIN_PASSWORD = 12;

async function main() {
  const email = String(process.env.ADMIN_EMAIL ?? '').trim().toLowerCase();
  const name = String(process.env.ADMIN_NAME ?? '').trim() || 'Administrador';
  const password = process.env.ADMIN_PASSWORD ?? '';
  if (!email) throw new Error('Falta ADMIN_EMAIL.');

  const { rows } = await pool.query('SELECT id, role FROM users WHERE lower(email) = $1', [email]);
  if (rows.length > 0) {
    // Una cuenta que ya existe conserva su contraseña y sus datos: solo cambia el rol.
    await pool.query("UPDATE users SET role = 'admin', active = true WHERE id = $1", [rows[0].id]);
    console.log(rows[0].role === 'admin' ? '• Esa cuenta ya era administradora' : '✓ La cuenta ahora es administradora');
    return;
  }

  if (password.length < MIN_PASSWORD) {
    throw new Error(`ADMIN_PASSWORD debe tener al menos ${MIN_PASSWORD} caracteres.`);
  }
  await pool.query(
    "INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, 'admin')",
    [name, email, await bcrypt.hash(password, 10)]
  );
  console.log('✓ Administrador creado');
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error('✗', err.message);
    pool.end();
    process.exit(1);
  });
