-- Esquema base de autenticación (HU01–HU02).
-- gen_random_uuid() requiere la extensión pgcrypto.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Búsqueda por correo en el login (case-insensitive).
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users (lower(email));
