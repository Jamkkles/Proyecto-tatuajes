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

Frontend lee `VITE_API_URL` (default en docker-compose: `http://localhost:3000`).

## Architecture

### Backend (`backend/src/`)
- CommonJS (`require`/`module.exports`), Express 5
- `config/db.js` — exporta un `Pool` de `pg`. Importar en models/controllers para queries
- `db/schema.sql` + `db/init.js` — esquema y seed (no hay ORM ni migraciones versionadas)
- `models/` — queries SQL crudas vía el pool (p. ej. `userModel.js`)
- `controllers/` — lógica de cada recurso (`authController.js`: login + register)
- `routes/` — Express Router montado en `app.js` (`/api/auth`, `/api/sketches`)
- `middleware/auth.js` — `requireAuth`: valida `Authorization: Bearer <token>` y deja el payload en `req.user`
- `services/storage/` — capa de almacenamiento de archivos con drivers
  intercambiables. **Nunca escribir a disco ni llamar a un SDK de nube fuera de
  aquí**: los controladores solo usan `save({ buffer, mimeType, userId })` y
  `remove(key)`. El driver activo lo elige `STORAGE_DRIVER`

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

### Frontend (`frontend/src/`)
- ESM, React 19 + TypeScript + Vite 8
- `lib/token.ts` — sesión en localStorage. Vive aparte de `auth.ts` porque
  `api.ts` lo necesita y así se evita el import circular
- `lib/api.ts` — `apiFetch`: adjunta el `Authorization` solo, detecta `FormData`
  para no pisar el `Content-Type`, y ante un 401 con token cierra la sesión
- `lib/auth.ts`, `lib/sketches.ts` — un módulo por recurso de la API
- `lib/theme.tsx` — tema claro/oscuro global. `<ThemeProvider>` (en `App.tsx`,
  dentro de `BrowserRouter`) + hook `useTheme()` → `{ light, toggle }`. Persiste
  en `localStorage['dash-theme']` y sincroniza entre pestañas. Pone
  `data-theme="light|dark"` en `<html>`; un script inline en `index.html` lo
  fija antes del primer paint para que no haya parpadeo
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

## Convenciones

- El backend usa CommonJS, no mezclar con ESM (`import`/`export`)
- La conexión a la DB siempre pasa por el pool de `config/db.js`, nunca crear conexiones directas
- Los archivos subidos siempre pasan por `services/storage`, nunca por `fs` directo
