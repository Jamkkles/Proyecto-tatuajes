const pool = require('../config/db');

/** Busca un usuario por correo (case-insensitive). Devuelve la fila o null. */
async function findByEmail(email) {
  const { rows } = await pool.query(
    `SELECT id, name, email, password_hash
       FROM users
      WHERE lower(email) = lower($1)
      LIMIT 1`,
    [email]
  );
  return rows[0] ?? null;
}

/** Crea un usuario y devuelve sus datos públicos (sin el hash). */
async function create({ name, email, passwordHash }) {
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash)
     VALUES ($1, $2, $3)
     RETURNING id, name, email`,
    [name, email, passwordHash]
  );
  return rows[0];
}

module.exports = { findByEmail, create };
