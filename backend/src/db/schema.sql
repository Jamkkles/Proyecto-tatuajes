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

-- ============================================================
-- Inventario de insumos (HU11, HU12, HU13)
--
-- Un insumo es lo que se consume trabajando: cartuchos, tintas, guantes,
-- film, papel transfer… `unit` dice en qué se cuenta (unidad, caja, ml…) y
-- `quantity` va en enteros de esa unidad (una tinta de 30 ml se lleva como
-- 30 ml o como 1 unidad, según prefiera el artista).
--
--   min_quantity → nivel crítico: al llegar o bajar de ahí, se avisa
--   unit_cost    → costo por unidad en pesos enteros; la base del cálculo
--                  de cotizaciones (HU14)
-- ============================================================
CREATE TABLE IF NOT EXISTS materials (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  category     TEXT NOT NULL DEFAULT 'otros'
                 CHECK (category IN ('agujas', 'tintas', 'proteccion', 'higiene',
                                     'papeleria', 'cuidado', 'maquinas', 'otros')),
  unit         TEXT NOT NULL DEFAULT 'unidad'
                 CHECK (unit IN ('unidad', 'caja', 'par', 'ml', 'rollo', 'hoja',
                                 'metro', 'set')),
  quantity     INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  min_quantity INTEGER NOT NULL DEFAULT 0 CHECK (min_quantity >= 0),
  unit_cost    INTEGER NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  supplier     TEXT,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS materials_user_name_idx ON materials (user_id, lower(name));

-- ============================================================
-- Cotizaciones automatizadas (HU14, HU15, HU16)
--
-- El alcance del proyecto acota esto a **costo de insumos**: lo que el artista
-- cobra por su arte no se calcula aquí, vive en `projects.total_price`.
--
-- El cálculo parte del boceto y del tamaño real sobre la piel:
--
--   área efectiva = ancho_cm × alto_cm × cobertura_tinta
--
-- `cobertura_tinta` es la fracción del rectángulo que está realmente entintada
-- (`sketches.ink_ratio`, medida sobre los píxeles del PNG al subirlo). Sin ella
-- un lettering fino y un blackwork macizo del mismo tamaño costarían lo mismo,
-- que es justo lo que no pasa en la realidad.
-- ============================================================

-- Regla de consumo de cada insumo (HU14). Dice CÓMO escala el gasto:
--   area    → por cm² efectivo (tintas, cartuchos)
--   sesion  → fijo por sesión (guantes, film, papel transfer)
--   hora    → por hora de trabajo (gasas, alcohol, toalla)
--   ninguno → no entra en la cotización (la máquina, el pedal, la fuente)
-- `consumption_rate` va en unidades del insumo por cada unidad de la base.
ALTER TABLE materials
  ADD COLUMN IF NOT EXISTS consumption_basis TEXT NOT NULL DEFAULT 'ninguno'
    CHECK (consumption_basis IN ('area', 'sesion', 'hora', 'ninguno'));

ALTER TABLE materials
  ADD COLUMN IF NOT EXISTS consumption_rate NUMERIC(12,5) NOT NULL DEFAULT 0
    CHECK (consumption_rate >= 0);

-- Cobertura de tinta del boceto: fracción de píxeles entintados sobre el total
-- del lienzo. Se mide con sharp al subir la imagen. Queda NULL en los bocetos
-- que ya estaban subidos antes de esta iteración; la cotización los trata con
-- un valor por defecto que el artista puede corregir a mano.
ALTER TABLE sketches
  ADD COLUMN IF NOT EXISTS ink_ratio NUMERIC(6,5)
    CHECK (ink_ratio IS NULL OR (ink_ratio > 0 AND ink_ratio <= 1));

-- Una cotización es una foto fija del cálculo: guarda los parámetros con que
-- se hizo y el detalle de insumos resultante. `project_id`/`session_id` son
-- opcionales porque se puede cotizar antes de tener cliente (una consulta
-- suelta por Instagram) y enlazarla después.
CREATE TABLE IF NOT EXISTS quotes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id        UUID REFERENCES projects(id) ON DELETE SET NULL,
  sketch_id         UUID REFERENCES sketches(id) ON DELETE SET NULL,
  session_id        UUID REFERENCES project_sessions(id) ON DELETE SET NULL,
  title             TEXT NOT NULL,
  -- Tamaño real sobre la piel. Si el proyecto tiene escena 3D, se precarga del
  -- tamaño con que se colocó la calca sobre el modelo anatómico.
  width_cm          NUMERIC(6,2) NOT NULL CHECK (width_cm > 0 AND width_cm <= 200),
  height_cm         NUMERIC(6,2) NOT NULL CHECK (height_cm > 0 AND height_cm <= 200),
  ink_ratio         NUMERIC(6,5) NOT NULL CHECK (ink_ratio > 0 AND ink_ratio <= 1),
  -- Variables de trazado (HU14): multiplican el consumo de tinta y agujas.
  stroke            TEXT NOT NULL DEFAULT 'medio'
                      CHECK (stroke IN ('fino', 'medio', 'grueso')),
  color_mode        TEXT NOT NULL DEFAULT 'negro'
                      CHECK (color_mode IN ('negro', 'grises', 'color')),
  sessions_count    INTEGER NOT NULL DEFAULT 1 CHECK (sessions_count BETWEEN 1 AND 50),
  estimated_minutes INTEGER NOT NULL DEFAULT 0 CHECK (estimated_minutes >= 0),
  -- Suma de las líneas, en pesos enteros. Se recalcula al editarlas (HU15).
  materials_cost    INTEGER NOT NULL DEFAULT 0 CHECK (materials_cost >= 0),
  status            TEXT NOT NULL DEFAULT 'borrador'
                      CHECK (status IN ('borrador', 'aceptada', 'descartada')),
  -- HU16: sello del descuento de stock. Marcar dos veces la sesión como
  -- completada no puede descontar el inventario dos veces.
  consumed_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS quotes_user_created_idx ON quotes (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS quotes_project_idx ON quotes (project_id);
-- HU16 busca por sesión al cerrarla: una sola cotización pendiente por sesión.
CREATE UNIQUE INDEX IF NOT EXISTS quotes_session_idx ON quotes (session_id)
  WHERE session_id IS NOT NULL;

-- Detalle de insumos de una cotización.
--
-- `name`, `unit` y `unit_cost` son copias congeladas del insumo al momento de
-- cotizar: si mañana sube el precio de la tinta o se borra un insumo, la
-- cotización que ya se le pasó al cliente no cambia sola.
--
-- `quantity` es NUMERIC a propósito: medio rollo de film o 0,3 de un pomo son
-- consumos reales y prorratearlos es lo correcto. El redondeo solo ocurre al
-- descontar stock (HU16), porque `materials.quantity` sí va en enteros.
CREATE TABLE IF NOT EXISTS quote_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id    UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  material_id UUID REFERENCES materials(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  unit        TEXT NOT NULL,
  quantity    NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
  unit_cost   INTEGER NOT NULL CHECK (unit_cost >= 0),
  -- HU15: `manual` marca las líneas que el artista agregó o ajustó a mano,
  -- para que un recálculo no se las pise.
  source      TEXT NOT NULL DEFAULT 'calculado'
                CHECK (source IN ('calculado', 'manual')),
  position    INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS quote_items_quote_idx ON quote_items (quote_id, position);

-- ============================================================
-- Color del boceto y de las tintas (HU14, parte de color)
--
-- La propuesta de solución (cap. 1.1.2) dice que el algoritmo procesa las
-- dimensiones "junto con otros parámetros como el grosor de los trazados y
-- colores". Con un solo desplegable negro/grises/color eso se cumple a medias:
-- la cotización dice cuánta tinta, pero no CUÁL. Estas dos columnas permiten
-- repartir los mililitros entre las tintas que el diseño realmente lleva.
-- ============================================================

-- Familias de color dominantes del boceto, con su parte del área entintada:
--   [{ "hex": "#c0392b", "share": 0.30 }, …]
-- Los `share` suman 1. Se mide con sharp al subir la imagen, igual que
-- `ink_ratio`. Queda NULL en los bocetos subidos antes de esta iteración y en
-- los que no tienen tinta reconocible.
ALTER TABLE sketches
  ADD COLUMN IF NOT EXISTS palette JSONB;

-- Color de la tinta, para poder emparejarla con la paleta del boceto. Solo
-- tiene sentido en la categoría 'tintas'; el resto de los insumos lo deja NULL
-- y entonces se cotizan por área completa, como siempre.
ALTER TABLE materials
  ADD COLUMN IF NOT EXISTS color_hex TEXT
    CHECK (color_hex IS NULL OR color_hex ~* '^#[0-9a-f]{6}$');

-- ============================================================
-- Medidas del tatuaje en el proyecto (HU14)
--
-- El tamaño real sobre la piel se decide al colocar la calca sobre el modelo
-- 3D: el visor normaliza cada cuerpo a su alto humano real, así que el `size`
-- de `previews.placements` ya está en metros de piel.
--
-- Esas medidas se copian aquí al guardar la escena enlazada a un proyecto, en
-- vez de dejarlas solo dentro del JSONB de la escena. Así la cotización las
-- tiene a mano sin salir a buscar la previsualización y cruzar su boceto, la
-- ficha del proyecto puede mostrarlas, y sobreviven si la escena se borra
-- (`preview_id` es ON DELETE SET NULL: se perdería el enlace y con él la única
-- copia de la medida).
-- ============================================================
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS width_cm NUMERIC(6,2)
    CHECK (width_cm IS NULL OR (width_cm > 0 AND width_cm <= 200));

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS height_cm NUMERIC(6,2)
    CHECK (height_cm IS NULL OR (height_cm > 0 AND height_cm <= 200));

-- ============================================================
-- Inventario inicial
--
-- Cada artista recibe el catálogo de insumos la primera vez que entra a su
-- inventario o a las cotizaciones. Esta marca dice si ya se le ofreció, y es lo
-- que hace que «Eliminar todos» no se deshaga solo: sin ella, un inventario
-- vacío no se distingue de uno que nunca se llenó y se volvería a sembrar.
-- NULL = todavía no.
-- ============================================================
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS materials_seeded_at TIMESTAMPTZ;
