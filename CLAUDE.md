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
```

Frontend lee `VITE_API_URL` (default en docker-compose: `http://localhost:3000`).

## Architecture

### Backend (`backend/src/`)
- CommonJS (`require`/`module.exports`), Express 5
- `config/db.js` — exporta un `Pool` de `pg`. Importar en models/controllers para queries
- `db/schema.sql` + `db/init.js` — esquema y seed (no hay ORM ni migraciones versionadas)
- `models/` — queries SQL crudas vía el pool (p. ej. `userModel.js`)
- `controllers/` — lógica de cada recurso (`authController.js`: login + register)
- `routes/` — Express Router montado en `index.js` (`/api/auth`)
- `middleware/auth.js` — `requireAuth`: valida `Authorization: Bearer <token>` y deja el payload en `req.user`

#### Contrato de autenticación (consumido por el frontend)
- `POST /api/auth/login` → `{ token, user: { id, name, email } }`; 401 con `{ message }` si falla
- `POST /api/auth/register` → igual respuesta; 409 si el correo ya existe
- JWT firmado con `JWT_SECRET`, expira en 7 días, payload `{ sub, email }`

### Frontend (`frontend/src/`)
- ESM, React 19 + TypeScript + Vite 8
- Actualmente es el template default de Vite — pendiente de implementar
- `VITE_API_URL` como base para llamadas al backend

### Base de datos
- PostgreSQL 16 (Docker). No hay migraciones definidas aún.

## Convenciones

- El backend usa CommonJS, no mezclar con ESM (`import`/`export`)
- La conexión a la DB siempre pasa por el pool de `config/db.js`, nunca crear conexiones directas
