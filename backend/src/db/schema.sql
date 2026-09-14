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

-- ============================================================
-- Agenda: clientes, proyectos y sesiones (HU17, HU19, HU20, HU21, HU24)
--
--   cliente 1─N proyecto 1─N sesión 1─N foto de avance
--
-- Cada sesión ES una cita: tiene fecha, hora y lo que se cobra en ella. Así una
-- pieza grande (un brazo completo) es un proyecto con varias citas, y una pieza
-- chica es un proyecto de una sola sesión.
--
-- Los montos son pesos chilenos enteros (el CLP no usa decimales).
-- ============================================================
CREATE TABLE IF NOT EXISTS clients (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  phone      TEXT,
  email      TEXT,
  instagram  TEXT,
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS clients_user_name_idx ON clients (user_id, lower(name));

-- sketch_id / preview_id enlazan el diseño de la galería y la escena 3D donde
-- se probó sobre el cuerpo. Si se borra el boceto o la escena, el proyecto
-- sigue existiendo sin ese enlace.
CREATE TABLE IF NOT EXISTS projects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id   UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT,
  body_zone   TEXT,
  total_price INTEGER NOT NULL DEFAULT 0 CHECK (total_price >= 0),
  status      TEXT NOT NULL DEFAULT 'activo'
                CHECK (status IN ('activo', 'terminado', 'cancelado')),
  sketch_id   UUID REFERENCES sketches(id) ON DELETE SET NULL,
  preview_id  UUID REFERENCES previews(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS projects_user_created_idx ON projects (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS projects_client_idx ON projects (client_id);

-- `project_sessions` y no `sessions`: ese nombre suele reclamarlo el middleware
-- de sesiones HTTP y se confundiría con la sesión de login.
--   price → lo que el cliente paga en esa sesión; `paid` marca si ya lo pagó
CREATE TABLE IF NOT EXISTS project_sessions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id       UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  starts_at        TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 120
                     CHECK (duration_minutes BETWEEN 15 AND 1440),
  price            INTEGER NOT NULL DEFAULT 0 CHECK (price >= 0),
  paid             BOOLEAN NOT NULL DEFAULT false,
  status           TEXT NOT NULL DEFAULT 'agendada'
                     CHECK (status IN ('agendada', 'completada', 'cancelada', 'no_asistio')),
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- El calendario consulta por rango de fechas del artista.
CREATE INDEX IF NOT EXISTS project_sessions_user_starts_idx
  ON project_sessions (user_id, starts_at);
CREATE INDEX IF NOT EXISTS project_sessions_project_idx
  ON project_sessions (project_id, starts_at);

-- Fotos del avance de cada sesión. Igual que los bocetos: la imagen vive en el
-- almacenamiento (services/storage) y aquí solo la referencia.
CREATE TABLE IF NOT EXISTS session_photos (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id     UUID NOT NULL REFERENCES project_sessions(id) ON DELETE CASCADE,
  caption        TEXT,
  storage_driver TEXT NOT NULL,
  storage_key    TEXT NOT NULL,
  url            TEXT NOT NULL,
  mime_type      TEXT NOT NULL,
  size_bytes     INTEGER NOT NULL,
  width          INTEGER,
  height         INTEGER,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS session_photos_session_idx
  ON session_photos (session_id, created_at);
