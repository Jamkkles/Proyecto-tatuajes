# Despliegue gratuito en la nube

Guía para publicar la plataforma sin costo y usarla como app (PWA) en el celular.
Ninguno de los servicios pide tarjeta.

```
 Celular / computador
        │  HTTPS
        ▼
 Cloudflare Pages ──────────►  Render (backend, Docker)  ──►  Neon (PostgreSQL)
 frontend estático             API de Express            └──►  Cloudinary (imágenes)
 *.pages.dev                   *.onrender.com
```

| Pieza | Servicio | Qué te da gratis |
|---|---|---|
| Frontend | Cloudflare Pages | Tráfico sin límite, nunca se duerme |
| Backend | Render (web service) | 750 h al mes, 512 MB, se duerme tras 15 min sin uso |
| Base de datos | Neon | 0,5 GB, sin vencimiento, se suspende tras 5 min sin uso |
| Imágenes | Cloudinary | 25 créditos al mes (≈ 25 GB de almacenamiento) |

Los límites de los planes gratuitos cambian con frecuencia: revísalos antes de
depender de ellos.

> **Qué esperar.** El backend se duerme y la primera petición tras un rato sin
> usarlo tarda cerca de un minuto. La app lo avisa en pantalla («El servidor está
> despertando»). Después va con normalidad.

Seguridad que ya trae el código para producción: el backend se niega a arrancar
con un `JWT_SECRET` débil, el registro de cuentas queda cerrado, hay límite de
intentos de login, CORS solo acepta tu frontend y la base se conecta con TLS.

---

## 1. Neon (base de datos)

1. Crea una cuenta en neon.com y un proyecto nuevo.
2. **Región: AWS US East 2 (Ohio)**, para quedar junto a Render.
3. **Versión de Postgres.** El esquema se probó en Postgres 18 (la que Neon crea
   hoy por defecto). Es más nueva que la del contenedor local (16), así que los
   respaldos usan una imagen 18 (ver *Mantenimiento*).
4. Hay dos cadenas de conexión: la **agrupada** (`…-pooler…`, `DATABASE_URL`) y la
   **directa** (`DATABASE_URL_UNPOOLED`). La app usa la agrupada; los scripts de
   administración como `db:init`, la directa. Son contraseñas: no las pegues en
   chats ni las subas a Git.

Si enlazaste el proyecto con la CLI (`neon link`), ambas ya están en `.env.local`
en la raíz del repositorio, que Git ignora.

## 2. Cloudinary (imágenes)

Crea una cuenta y, en *Dashboard → API Keys*, copia **Cloud name**, **API Key** y
**API Secret**.

## 3. Crear las tablas y tu usuario

Desde tu computador, con Docker corriendo, en la raíz del repositorio. Usa **tus**
datos: la contraseña debe tener al menos 10 caracteres (`db:init` se niega a
sembrar la de ejemplo en una base que no sea local). La cadena de conexión se
lee de `.env.local`, así no hay que copiarla a mano:

```bash
docker exec \
  -e DATABASE_URL="$(grep '^DATABASE_URL_UNPOOLED=' .env.local | cut -d= -f2- | tr -d '"')" \
  -e SEED_NAME='Tu Nombre' \
  -e SEED_EMAIL='tu@correo.cl' \
  -e SEED_PASSWORD='una-contraseña-larga-y-propia' \
  proyecto-tatuajes-backend-1 npm run db:init
```

Debe terminar con `✓ Esquema aplicado` y `✓ Usuario de prueba creado`. Es
idempotente: se puede repetir (por ejemplo tras cambios en `schema.sql`).

## 4. Render (backend)

1. Crea una cuenta en render.com e inicia sesión con GitHub.
2. *New → Blueprint*, elige este repositorio. Render lee `render.yaml`.
3. Te pide las variables marcadas `sync: false`:

   | Variable | Valor |
   |---|---|
   | `DATABASE_URL` | La cadena **agrupada** de Neon (la que contiene `-pooler`) |
   | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Del paso 2 |
   | `CORS_ORIGIN`, `FRONTEND_URL` | De momento cualquier texto: se corrigen en el paso 6 |

   `JWT_SECRET` lo genera Render solo.
4. Espera a que termine el despliegue y abre `https://TU-SERVICIO.onrender.com/health`:
   debe responder `{"status":"ok",…}`. Anota esa URL.

## 5. Cloudflare Pages (frontend)

1. Crea una cuenta en cloudflare.com → *Workers & Pages → Create → Pages →
   Connect to Git* y elige el repositorio.
2. Configuración de compilación:

   | Campo | Valor |
   |---|---|
   | Root directory | `frontend` |
   | Build command | `npm run build` |
   | Build output directory | `dist` |

3. Variables de entorno:

   | Variable | Valor |
   |---|---|
   | `VITE_API_URL` | La URL de Render del paso 4, **sin barra final** |
   | `VITE_ALLOW_REGISTER` | `false` |
   | `NODE_VERSION` | `22` |

4. Despliega. Anota la URL (`https://TU-PROYECTO.pages.dev`).

Las cabeceras de caché y seguridad salen de `frontend/public/_headers`; Pages no
lee el `nginx.conf` de Docker.

## 6. Cerrar el círculo

En Render → tu servicio → *Environment*, corrige:

- `CORS_ORIGIN` = `https://TU-PROYECTO.pages.dev` (sin barra final)
- `FRONTEND_URL` = `https://TU-PROYECTO.pages.dev`

Guarda; Render redespliega solo.

## 7. Comprobar que todo funciona

- [ ] Abres la URL de Pages e inicias sesión con el usuario del paso 3.
- [ ] Subes un boceto: debe aparecer con una URL de `res.cloudinary.com`.
- [ ] Colocas un tatuaje en la previsualización 3D y guardas la escena.
- [ ] Creas una cotización.
- [ ] `/registro` no deja crear cuentas.

Si el login falla con «No pudimos conectar con el servidor», casi siempre es
`CORS_ORIGIN` mal escrito (con barra final, con `http` en vez de `https`) o
`VITE_API_URL` apuntando a otro sitio. Recuerda que `VITE_*` se fija al
compilar: tras cambiarlas hay que volver a desplegar el frontend.

## 8. Instalarla en el celular

- **Android (Chrome):** menú ⋮ → *Instalar aplicación*.
- **iPhone (Safari):** botón Compartir → *Añadir a pantalla de inicio*. Tiene que
  ser Safari; desde Chrome en iOS no se puede.

Se abre sin barra del navegador y con el ícono de la «H».

## Mantenimiento

**Actualizar.** `git push` a la rama conectada despliega solo el frontend y el
backend. Si cambiaste `schema.sql`, repite el paso 3.

**Evitar el letargo del backend (opcional).** Un monitor externo que visite
`/health` cada pocos minutos mantiene el servicio despierto; 750 horas alcanzan
para un servicio todo el mes. Comprueba que el plan gratuito del monitor y las
condiciones de Render lo permitan.

**Respaldos.** Neon conserva un historial limitado en el plan gratis. Un
respaldo propio. `pg_dump` se niega a funcionar contra un servidor más nuevo que
él, y el contenedor local es Postgres 16 frente al 18 de Neon, por eso se usa una
imagen 18 aparte:

```bash
docker run --rm postgres:18-alpine pg_dump \
  "$(grep '^DATABASE_URL_UNPOOLED=' .env.local | cut -d= -f2- | tr -d '"')" \
  > respaldo-$(date +%F).sql
```

**Correo de recuperación de contraseña.** Sin `SMTP_*` el backend usa un buzón de
pruebas (Ethereal) y los correos no llegan a nadie. Con SMTP real hay que
comprobar que Render no bloquee esos puertos en el plan gratuito; si lo hace,
sirve un proveedor con API web.

**Datos locales.** Esta guía empieza con una base vacía. Migrar la de desarrollo
exigiría reescribir las URLs de los bocetos (guardan `http://localhost:3000/…`) y
subir los archivos a Cloudinary.
