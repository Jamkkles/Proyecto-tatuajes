const crypto = require('crypto');
const pool = require('../config/db');

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Genera un token, lo guarda hasheado y devuelve el token plano para el correo. */
async function create(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

  await pool.query(
    `INSERT INTO password_resets (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE
       SET token_hash = EXCLUDED.token_hash,
           expires_at = EXCLUDED.expires_at,
           created_at = now()`,
    [userId, tokenHash, expiresAt],
  );

  return token;
}

/** Busca un registro válido (no expirado) por token plano. */
async function findValidByToken(token) {
  const tokenHash = hashToken(token);
  const { rows } = await pool.query(
    `SELECT pr.user_id, u.email
       FROM password_resets pr
       JOIN users u ON u.id = pr.user_id
      WHERE pr.token_hash = $1
        AND pr.expires_at > now()
      LIMIT 1`,
    [tokenHash],
  );
  return rows[0] ?? null;
}

/** Elimina el token tras usarlo. */
async function deleteByUserId(userId) {
  await pool.query('DELETE FROM password_resets WHERE user_id = $1', [userId]);
}

module.exports = { create, findValidByToken, deleteByUserId };
