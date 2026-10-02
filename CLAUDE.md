# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

MVP de plataforma web para estudios de tatuaje. Stack: React + Node.js/Express + PostgreSQL.

## Commands

### Backend
```bash
cd backend
npm install
npm run db:init    # crea tablas + usuario de prueba (requiere PostgreSQL arriba)
npm run sketches:analyze   # mide tinta y colores de los bocetos ya subidos
npm run dev        # nodemon, hot-reload en puerto 3000
npm start          # producción
```

Usuario de prueba sembrado por `db:init`: `hola@hectortattoos.cl` / `tatuajes123`.

### Frontend
```bash
cd frontend
npm install
npm run dev        # Vite dev server en puerto 5173
npm run build      # tsc + vite build
npm run lint       # eslint
```

### Full stack con Docker
```bash
docker compose up          # levanta postgres + backend + frontend
docker compose up postgres # solo la base de datos
```

### Pruebas del backend
```bash
docker exec proyecto-tatuajes-backend-1 npx jest --runInBand
```
Se corren **dentro del contenedor**: en el host `jest` se cuelga cuando el
proyecto está en una carpeta sincronizada con iCloud.

### Despliegue (gratis, en la nube)
Frontend en Cloudflare Pages, backend en Render (`render.yaml`), PostgreSQL en
Neon e imágenes en Cloudinary. Paso a paso en `docs/despliegue.md`.

## Environment

Backend requiere `backend/.env` (copiar de `backend/.env.example`):
```
PORT=3000
DATABASE_URL=postgresql://tatuajes_user:tatuajes_pass@localhost:5432/tatuajes_db
JWT_SECRET=cambia_este_secreto_en_produccion
STORAGE_DRIVER=local          # local | cloudinary
PUBLIC_URL=http://localhost:3000
```

Lista completa en `backend/.env.example` (SMTP para HU03, credenciales de
Cloudinary, usuario semilla).

**Con `NODE_ENV=production` el backend cambia de comportamiento a propósito:**
se niega a arrancar si `JWT_SECRET` falta, es el de ejemplo o tiene menos de 32
caracteres (`config/jwt.js`); el registro de cuentas queda cerrado (403) salvo
`ALLOW_REGISTER=true`; y CORS no acepta ningún origen salvo los de `CORS_ORIGIN`
(lista separada por comas, sin barra final). En desarrollo todo sigue abierto.
`db:init` se niega a sembrar la contraseña de ejemplo en una base que no sea
local. El frontend lee `VITE_API_URL` y `VITE_ALLOW_REGISTER` (ver
`frontend/.env.example`), que Vite fija al compilar.

Frontend lee `VITE_API_URL` (default en docker-compose: `http://localhost:3000`).

## Architecture

### Backend (`backend/src/`)
- CommonJS (`require`/`module.exports`), Express 5
- `config/db.js` — exporta un `Pool` de `pg`. Importar en models/controllers para queries
- `db/schema.sql` + `db/init.js` — esquema y seed (no hay ORM ni migraciones versionadas)
- `models/` — queries SQL crudas vía el pool (p. ej. `userModel.js`)
- `controllers/` — lógica de cada recurso (`authController.js`: login + register)
- `routes/` — Express Router montado en `app.js` (`/api/auth`, `/api/sketches`,
  `/api/previews`, `/api/clients`, `/api/projects`, `/api/sessions`)
- `middleware/auth.js` — `requireAuth`: valida `Authorization: Bearer <token>` y deja el payload en `req.user`
- `middleware/security.js` — CORS por `CORS_ORIGIN`, `registrationOpen`,
  límite de intentos de login por IP (`createAuthLimiter`, 20 cada 15 min, se
  salta bajo jest) y `trustProxy` (1 salto en producción: sin él, detrás de
  Render todas las peticiones parecen de la misma IP). `app.js` añade `helmet`
  con `Cross-Origin-Resource-Policy: cross-origin`: con el valor por defecto el
  frontend, que vive en otro dominio, no podría mostrar las imágenes de /uploads
- `config/dbConfig.js` — opciones del pool pensadas para una base que se
  suspende sola (Neon): espera 15 s al conectar y suelta rápido las conexiones
  ociosas; `DATABASE_SSL=true` fuerza TLS
- `middleware/imageUpload.js` — multer en memoria para el campo `image` (5 MB,
  JPG/PNG/WEBP/GIF), compartido por bocetos y fotos de sesión
- `utils/fields.js` — validadores de campos de la agenda; lanzan `FieldError`
  y `sendError` lo traduce a 400 (o 500 con log)
- `services/storage/` — capa de almacenamiento de archivos con drivers
  intercambiables. **Nunca escribir a disco ni llamar a un SDK de nube fuera de
  aquí**: los controladores solo usan `save({ buffer, mimeType, userId, folder })`
  (`folder`: `'sketches'` por defecto o `'sessions'`), `read(key)` y `remove(key)`. El driver
  activo lo elige `STORAGE_DRIVER`. `removeFiles(rows)` borra varios archivos
  con el driver con que se subió cada uno

#### Contrato de autenticación (consumido por el frontend)
- `POST /api/auth/login` → `{ token, user: { id, name, email } }`; 401 con `{ message }` si falla
- `POST /api/auth/register` → igual respuesta; 409 si el correo ya existe
- JWT firmado con `JWT_SECRET`, expira en 7 días, payload `{ sub, email }`

#### Contrato de la galería de bocetos (T0010)
Todas las rutas exigen `requireAuth`; cada consulta filtra por `user_id` del
token, así que un artista nunca ve ni toca bocetos de otro (un id ajeno
devuelve 404, no 403, para no revelar que existe).
- `GET /api/sketches?status=&tag=` → `{ sketches: [...] }`
- `POST /api/sketches` — `multipart/form-data` con el campo `image` más
  `title` (obligatorio), `description`, `bodyZone`, `status`, `tags` (separadas
  por comas) → `201 { sketch }`. Máx. 5 MB, JPG/PNG/WEBP/GIF
- `PATCH /api/sketches/:id` — solo metadatos, no reemplaza la imagen
- `DELETE /api/sketches/:id` → `204`; borra la fila y el archivo
- `GET /uploads/...` — estáticos del driver local

#### Contrato de la agenda (HU17–HU21, HU24)
Modelo: cliente 1─N proyecto 1─N sesión 1─N foto. **Cada sesión es una cita**
(fecha, hora, duración y lo que se cobra en ella). Montos en CLP enteros. Mismas
reglas de propiedad que los bocetos: todo filtra por `user_id`, un id ajeno en la
URL da 404 y una referencia ajena en el cuerpo (`clientId`, `projectId`,
`sketchId`, `previewId`) da 400. Los INSERT hijos usan `INSERT … SELECT` desde el
padre filtrado por usuario, así que no hay forma de colgar filas de otro artista.
- `GET /api/clients?q=` → `{ clients }` (con `projects_count`, `next_session_at`);
  `GET /api/clients/:id` → `{ client, projects }`; `POST`, `PATCH`, `DELETE`
- `GET /api/projects?clientId=&status=` → `{ projects }` con resumen
  (`client_name`, `sketch_url`, `preview_name`, `planned_amount`,
  `paid_amount`, `sessions_count`); `GET /api/projects/:id` → `{ project, sessions }`
  (cada sesión con `photos`); `POST` (`clientId`, `title`, `totalPrice`, …), `PATCH`, `DELETE`
- `GET /api/sessions?from=&to=` (ISO, rango máx. 400 días) → `{ sessions }` con
  proyecto y cliente, para el calendario; `POST` (`projectId`, `startsAt`,
  `durationMinutes`, `price`, `paid`, `status`, `notes`), `PATCH`, `DELETE`
- `POST /api/sessions/:id/photos` — multipart `image` + `caption` → `201 { photo }`;
  `DELETE /api/sessions/:id/photos/:photoId` → `204`
- Borrar un cliente, proyecto o sesión borra en cascada las filas; el
  controlador consulta antes los archivos de las fotos (`filesFor`) y los
  elimina del almacenamiento después

#### Contrato del inventario (HU11–HU13)
Un insumo es lo que se consume tatuando. `unit` dice en qué se cuenta y
`quantity`/`min_quantity` van en enteros de esa unidad; `unit_cost` en pesos
enteros (base del cálculo de cotizaciones, HU14). Nivel crítico =
`quantity <= min_quantity`; el listado devuelve esos insumos primero.
- `GET /api/materials?category=&q=&low=true` → `{ materials }`
- `POST /api/materials` (`name` obligatorio, `category`, `unit`, `quantity`,
  `minQuantity`, `unitCost`, `supplier`, `notes`) → `201 { material }`
- `PATCH /api/materials/:id`, `DELETE /api/materials/:id` → `204`
- `POST /api/materials/:id/stock` con `{ delta }` (negativo para descontar) →
  el stock se suma en la base con `GREATEST(0, …)`, así dos ajustes seguidos no
  se pisan ni queda negativo
- `consumption_basis` (`area` | `sesion` | `hora` | `ninguno`) + `consumption_rate`
  dicen cómo se gasta el insumo. Es lo que lo hace entrar en las cotizaciones:
  sin regla, no aparece
- `color_hex` solo se usa en la categoría `tintas`: es lo que permite
  emparejarlas con los colores del boceto. Una tinta sin color se cotiza por el
  área completa del diseño
- `unit_cost` va **por unidad de conteo**, no por envase: un frasco de 30 ml a
  $18.000 son $600 por ml. Cargar el precio del envase multiplica la cotización
  por el contenido entero, que es el error más fácil de cometer aquí

#### Contrato de las cotizaciones (HU14–HU16)
Calcula **costo de insumos**, nunca el precio del arte (eso es
`projects.total_price`). El cálculo vive en `services/quoteEngine.js` y lo hace
siempre el servidor. Mismas reglas de propiedad que la agenda: todo filtra por
`user_id`, un id ajeno en la URL da 404 y una referencia ajena en el cuerpo da
400 (se comprueba con `projectModel.ownsReference`).

El área que se cobra es `ancho_cm × alto_cm × cobertura`, donde la cobertura es
`sketches.ink_ratio`: la fracción del lienzo con tinta, medida con `sharp` al
subir el boceto (`readInkProfile`).

**De dónde salen los centímetros.** El tamaño se decide al colocar la calca en
el visor 3D, que normaliza cada cuerpo a su alto humano real: por eso
`previews.placements[].size` ya está en metros de piel (×100 → cm). Al guardar
una escena enlazada a un proyecto, `Preview3D` copia esa medida a
`projects.width_cm` / `height_cm`. La cotización lee del proyecto, y solo cae a
abrir la escena si el proyecto aún no la tiene copiada. Guardarla en el proyecto
no es redundante: `preview_id` es `ON DELETE SET NULL`, así que borrar la escena
se llevaría la única copia de la medida.

**Reparto por color.** `readInkProfile` también mide `sketches.palette`: las
familias de color dominantes con su parte del área (`[{hex, share}]`, suman 1).
`services/colorMatch.js` las empareja en OKLab con las tintas que tengan
`color_hex`, y cada tinta recibe solo la parte del diseño que lleva su color.
Sin esto, un diseño 100% negro cotizaba *todas* las tintas del inventario por el
área completa. Reglas del emparejamiento:
- Los grises van siempre a la tinta oscura: al tatuar se consiguen rebajando el
  negro, no mezclando blanco. La tinta blanca nunca se asigna sola (sobre un
  lienzo blanco es indetectable)
- Un color sin tinta parecida (distancia > 0,12) sale en `missingInks` y su
  parte **no** se reparte entre las tintas que sí hay. Se cotiza con la tinta
  de referencia más parecida (`TINTAS_REFERENCIA` + `suggestInk` en
  `colorMatch.js`): una línea `«Tinta café (por comprar)»` con
  `materialId: null`, que entra en el total y no descuenta stock. Antes solo se
  avisaba y un dibujo a color salía cotizado solo con negro
- Gris = croma < 0,02 (`isGray`), o < 0,04 si además es casi negro (L < 0,3).
  Con el corte único en 0,04 los cafés de poca saturación (pelaje, piel) pasaban
  por grises y se iban enteros a la tinta negra
- Los insumos sin `color_hex` (cartuchos, guantes) no se reparten
- `quoteController` le pasa al motor el inventario **completo**
  (`listByUser`, no `listConsumable`): el motor ya descarta lo que no se gasta, y
  así una tinta con color pero sin tasa no se reporta como faltante
- **La invariante**: las partes del área siempre suman 1. El área entintada se
  REPARTE entre las tintas, nunca se multiplica por cuántas haya en el
  inventario (eso hacía que un tatuaje en negro cotizara todas las tintas)
- Sin paleta medida, el reparto sale de `colorMode` (`allocateByMode`):
  `negro`/`grises` → todo a la tinta oscura; `color` → mitad al negro y mitad
  repartida entre las cromáticas. Una tinta **sin** color declarado es
  candidata a ser el negro; una que declaró ser roja, no
- `isInk` exige `consumption_basis = 'area'`: las copitas de tinta son de la
  categoría pero se gastan por sesión y no entran en el reparto
- Dos listas distintas: las **cotizables** (con color y con regla por área)
  reciben parte del área; las **declaradas** (con color, con regla o sin ella)
  solo sirven para no reportar como faltante una tinta que el artista sí tiene
- `colorModeFromPalette` (frontend) deduce el modo al elegir boceto, para que el
  desplegable no contradiga al dibujo. Es solo prellenado: con paleta medida, el
  reparto lo decide ella y no el desplegable
- `POST /api/quotes/estimate` → `{ estimate, consumableCount }`, calcula sin guardar.
  `estimate` trae `workMinutes` (horas de aguja), `estimatedMinutes` (aguja +
  preparación) y `sessionsCount`

**Sesiones y tiempo.** La cotización es del **proyecto completo**: repartir la
misma pieza en más citas no la agranda. Por eso `sessionsCount` no se pide, se
deduce — `ceil(horas de aguja / HORAS_POR_SESION)` — y el artista solo la fija
si ya la acordó. Lo único que crece con las sesiones es lo que se monta en cada
cita (base `sesion`) y el piso de esterilidad de lo que se desecha.
`MINUTOS_PREPARACION` (calcar, montar, limpiar) va aparte del rendimiento por
área: es lo que explica que una pieza chica nunca sea tan rápida como sugeriría
su tamaño. Las constantes están contrastadas con tiempos del oficio; el detalle
de la calibración está en el comentario de `CM2_POR_HORA`
- `GET /api/quotes?projectId=`, `GET /api/quotes/:id` → con `items`
- `POST /api/quotes` (`title`, `widthCm`, `heightCm`, …, `items`) → `201 { quote }`
- `PATCH /api/quotes/:id` — ajusta parámetros o reemplaza `items` (HU15). El
  costo lo recalcula el servidor; una cotización ya consumida da 409
- `DELETE /api/quotes/:id` → `204`
- `POST /api/quotes/:id/consume` → descuenta stock; 409 si ya se descontó
- Al pasar una sesión a `completada`, `sessionController` descuenta sola la
  cotización enlazada y devuelve `{ session, stock }`. `quotes.consumed_at` se
  sella dentro de la transacción, así que cerrar dos veces no descuenta dos veces

### Frontend (`frontend/src/`)
- ESM, React 19 + TypeScript + Vite 8
- `lib/token.ts` — sesión en localStorage. Vive aparte de `auth.ts` porque
  `api.ts` lo necesita y así se evita el import circular
- `lib/api.ts` — `apiFetch`: adjunta el `Authorization` solo, detecta `FormData`
  para no pisar el `Content-Type`, y ante un 401 con token cierra la sesión
- `lib/auth.ts`, `lib/sketches.ts`, `lib/previews.ts`, `lib/agenda.ts`,
  `lib/materials.ts` — un módulo por recurso de la API.
  `lib/money.ts` formatea y lee pesos (lo usan agenda e inventario);
  `lib/agendaForms.ts` convierte formularios ↔ API
- `/inventario` — insumos con stock, nivel crítico, costo unitario, regla de
  consumo y, en las tintas, su color. `MATERIAL_PRESETS` (en `lib/materials.ts`)
  es el catálogo de insumos típicos de tatuaje, cada uno con su `basis`, `rate`
  y `unitCost` sugeridos (precios referenciales de Chile, por unidad de conteo),
  y las tintas con su `colorHex`
- `/cotizaciones?proyecto=<id>` — calculadora de costo de insumos
  (`pages/Cotizaciones.tsx` + `Cotizaciones.css`, clases `qt-*`). Estima en
  vivo contra `/api/quotes/estimate` mientras se ajustan los campos, deja
  editar el detalle y recién entonces guarda. La duración se formatea con
  `formatDuration` de `agenda.ts`, no se duplica en `quotes.ts`
- Agenda: `/citas` (calendario + nueva cita, crea cliente/proyecto en el mismo
  paso), `/clientes`, `/clientes/:id`, `/proyectos/:id` (pagos, sesiones, fotos,
  enlace a boceto y escena 3D). Comparten `pages/Studio.css` (clases `st-*`) y
  `components/AgendaFields.tsx`
- `/previsualizacion?proyecto=<id>` abre la escena enlazada al proyecto (o deja
  su boceto listo para colocar) y al guardar enlaza la escena al proyecto
- `lib/serverWake.ts` + `components/ServerWakeNotice.tsx` — el backend gratuito
  se duerme y tarda ~1 min en despertar. `apiFetch` marca como lenta cualquier
  petición (salvo subidas de imagen, que tardan por su tamaño) que pase de 4 s, y
  se muestra un aviso hasta que responde
- PWA: `public/manifest.webmanifest`, `public/sw.js` (solo cachea el shell; los
  datos viven en la API, así que el modo offline es mínimo a propósito) e íconos
  PNG (`icon-192`, `icon-512`, `icon-maskable-512`, `apple-touch-icon`, este
  último a pantalla completa porque iOS aplica su propia máscara).
  `public/_headers` hace en Cloudflare Pages lo que `nginx.conf` hace en Docker
- `lib/theme.tsx` — tema claro/oscuro global. `<ThemeProvider>` (en `App.tsx`,
  dentro de `BrowserRouter`) + hook `useTheme()` → `{ light, toggle }`. Persiste
  en `localStorage['dash-theme']` y sincroniza entre pestañas. Pone
  `data-theme="light|dark"` en `<html>`; un script inline en `index.html` lo
  fija antes del primer paint para que no haya parpadeo
- `lib/tattooViewer.ts` — visor 3D (three.js puro). La calca se pega con
  `DecalGeometry`, que recorta por una **caja**. Eso trae dos límites, y los dos
  se resuelven en `buildDecalGeometry`:
  1. La caja atraviesa el miembro y recortaba también la cara de atrás, así que
     el dibujo salía repetido. `cullAwayFacing` descarta los triángulos que no
     miran al proyector (`MIN_FACING = 0.02`, lo mínimo para no perder
     envolvente).
  2. Una proyección plana **no pasa de la silueta**: reparte la textura según la
     sombra del dibujo, que se agolpa al llegar al borde del brazo y se corta.
     Por eso, cuando la piel se curva lo bastante (`MIN_WRAP_ANGLE`), se
     proyecta una caja que abarca el anillo entero y `wrapUv` **recalcula las
     coordenadas de textura por ángulo alrededor del eje del miembro**. Así la
     imagen avanza a paso constante sobre la piel y rodea la muñeca en vez de
     cortarse. Cuesta una sola proyección, igual que antes.
  `fitCurvature` da el radio y el centro ajustando una **circunferencia por tres
  puntos de la superficie**, no por el giro de las normales: estas mallas vienen
  suavizadas y daban 7,4 cm de radio en un antebrazo donde la medida real es la
  mitad. El vano de muestreo se va cerrando (`CURVATURE_SPANS`) porque en una
  muñeca delgada un vano ancho cae fuera de la piel.
  El tope del deslizador sale de `maxTattooSize(model, zone)`, con valores
  **fijos** por zona (`PART_MAX_WIDTH`, arco de ~300° de la circunferencia
  local). Medirlo en vivo contra el modelo daba un tope que cambiaba con cada
  giro y cada arrastre —son rayos contra una malla con relieve— y el deslizador
  se volvía loco: la escala se movía bajo el dedo. Girar tampoco cambia ya el
  tamaño.
  **Lo que hace fluido el arrastre**, todo en `DecalEntry`:
  - `curvature` guarda **solo el radio**, y se congela mientras se arrastra (se
    remide al soltar). Remedirlo cada centímetro cambiaba el envolvente de golpe
    y el dibujo saltaba; medirlo en cada reconstrucción lo hacía temblar.
  - El **centro del cilindro no se guarda**: se deduce en cada reconstrucción de
    dónde está la calca ahora (`posición − normal × radio`). Guardarlo dejaba el
    anillo de proyección clavado donde se midió mientras el dibujo se iba, y la
    imagen se movía errática hasta desaparecer al salirse del anillo viejo. Es
    la causa de la que venía el «se mueve raro al arrastrar».
  - `patch` guarda el trozo de malla alrededor de la calca
    (`localPatch` + `patchFor`). `DecalGeometry` recorre la malla entera en cada
    reconstrucción: 41 ms sobre el brazo de 40.000 triángulos (24 fps al
    arrastrar) frente a 18 ms sobre la vecindad. Dos cosas que hay que respetar:
    el alcance que se pide tiene que cubrir **la caja del anillo entero**
    (`2,08 × radio + media calca`), porque con un solo radio el recorte se
    quedaba corto y la imagen salía mordida por los lados; y el recorte se hace
    con búferes tipados, porque ir empujando a un array normal costaba 212 ms
    justo al agarrar la calca (ahora 32 ms). Si se quedaría con más del 60 % de
    la malla (`PATCH_WORTH_IT`) no compensa y se proyecta sobre el cuerpo
    entero; esa decisión también se cachea. Medido en el navegador: 60 fps de
    mediana durante un arrastre (16,7 ms, p95 18 ms, ningún fotograma por
    encima).
  - Durante el arrastre se **captura el puntero**. Sin eso, sacarlo del lienzo
    cortaba los eventos: el gesto se quedaba abierto, la órbita bloqueada, y al
    volver a entrar la calca pegaba un salto hasta el cursor.
  El giro va por un deslizador continuo (`rollPlacement` aplica incrementos, y
  la página guarda el ángulo en `roll` para saber desde dónde gira). **Al
  arrastrar** la calca no se rehace su orientación desde la normal nueva —eso
  perdía el giro que el artista había dado—, sino que se aplica la rotación
  mínima de la normal anterior a la nueva (`setFromUnitVectors`), que adapta la
  calca a la piel conservando su inclinación. Ese origen se **vuelve a anclar
  cada cuarto de vuelta** (`REANCHOR_DOT`): con normales casi opuestas la
  rotación mínima es ambigua y el dibujo pegaba un volantazo, y anclar por
  tramos evita ese punto sin acumular el temblor de la malla. Y se usa
  `hit.normal` (`smoothNormal`), interpolada entre vértices: con
  `hit.face.normal` la calca saltaba de triángulo en triángulo sobre un brazo de
  pocos polígonos. La opacidad
  se eliminó —un tatuaje no es translúcido—;
  `previews.placements[].render.opacity` queda opcional solo para abrir escenas
  guardadas antes del cambio
- `components/Atmos.tsx` — fondo de nubes compartido (arco fijo abajo-derecha);
  se revela al hacer scroll (`--atmos-p`). `components/ThemeToggle.tsx` — botón
  sol/luna, recibe `className`
- `lib/useHideOnScroll.ts` — hook para header auto-oculto: `true` cuando el
  header debería esconderse (baja = esconde, sube / tope / mouse arriba =
  muestra). La página aplica su propia clase `--hidden` con `transform`
- `pages/` — una página por ruta, con su `.css` hermano
- `VITE_API_URL` como base para llamadas al backend

#### Convención de páginas de la app autenticada
1. Renderizar `<Atmos />` una vez dentro del contenedor raíz de la página.
2. Colocar `<ThemeToggle className="..." />` donde corresponda (usa `useTheme()`
   por debajo).
3. El contenedor raíz va `position: relative` y su contenido en `z-index: 1`
   (la atmósfera es `position: fixed; z-index: 0`).
4. **El estilo oscuro es el base.** El claro se escribe con el prefijo
   `[data-theme="light"] .mi-pagina …`. Si la página usa los tokens globales
   (`--ink`, `--fog`, `--ash`, …), lo más limpio es redefinirlos bajo
   `[data-theme="light"] .mi-pagina` y ajustar solo los colores literales.

### Base de datos
- PostgreSQL 16 (Docker). No hay migraciones definidas aún: al añadir tablas a
  `schema.sql` hay que volver a correr `npm run db:init` sobre la base existente
  (todo el esquema usa `IF NOT EXISTS`, así que es idempotente)
- Las imágenes **no** se guardan en PostgreSQL. La tabla `sketches` solo guarda
  metadatos más `storage_driver` + `storage_key` + `url`
- Las columnas añadidas a tablas existentes van como
  `ALTER TABLE … ADD COLUMN IF NOT EXISTS` al final de `schema.sql`, para que
  volver a correr `db:init` siga siendo idempotente sobre una base con datos

## Convenciones

- El backend usa CommonJS, no mezclar con ESM (`import`/`export`)
- La conexión a la DB siempre pasa por el pool de `config/db.js`, nunca crear conexiones directas
- Los archivos subidos siempre pasan por `services/storage`, nunca por `fs` directo
