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

-- Tokens de recuperación de contraseña (HU03).
-- Un solo token activo por usuario (UNIQUE en user_id).
CREATE TABLE IF NOT EXISTS password_resets (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Galería de bocetos (HU04 / T0010).
-- La imagen NO se guarda en la base de datos: aquí solo viven los metadatos y
-- la referencia al archivo en el almacenamiento (disco local o nube).
--   storage_driver → qué backend guardó el archivo ('local' | 'cloudinary')
--   storage_key    → identificador del archivo dentro de ese backend, lo que
--                    permite borrarlo después
--   url            → dirección pública para mostrarlo en el <img>
CREATE TABLE IF NOT EXISTS sketches (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  description    TEXT,
  body_zone      TEXT,
  status         TEXT NOT NULL DEFAULT 'disponible'
                   CHECK (status IN ('disponible', 'reservado', 'tatuado')),
  tags           TEXT[] NOT NULL DEFAULT '{}',
  storage_driver TEXT NOT NULL,
  storage_key    TEXT NOT NULL,
  url            TEXT NOT NULL,
  mime_type      TEXT NOT NULL,
  size_bytes     INTEGER NOT NULL,
  width          INTEGER,
  height         INTEGER,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- La galería siempre se lista por usuario y de más nuevo a más viejo.
CREATE INDEX IF NOT EXISTS sketches_user_created_idx
  ON sketches (user_id, created_at DESC);

-- Filtrado por etiquetas (tags @> ARRAY['blackwork']).
CREATE INDEX IF NOT EXISTS sketches_tags_idx ON sketches USING GIN (tags);

-- ============================================================
-- Previsualizaciones 3D (T00xx)
-- Una escena guardada: el modelo de cuerpo elegido, el encuadre de cámara y
-- los tatuajes colocados encima. Las colocaciones van en JSONB porque su forma
-- todavía se está afinando; lo que sí es fijo es la pertenencia al usuario.
--
-- Cada colocación guarda la RECETA, no los píxeles:
--   { sketchId, position:[x,y,z], quaternion:[x,y,z,w], size:[w,h,d],
--     anchor:{ faceIndex, uv:[u,v] }, render:{ order, opacity, flipX } }
-- Se guarda cuaternión (el Euler necesita orden explícito para round-trip) y
-- el ancla uv/faceIndex, que permite recolocar si algún día cambia el modelo.
-- ============================================================
CREATE TABLE IF NOT EXISTS previews (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  model_id   TEXT NOT NULL,
  camera     JSONB,
  placements JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS previews_user_created_idx
  ON previews (user_id, created_at DESC);
