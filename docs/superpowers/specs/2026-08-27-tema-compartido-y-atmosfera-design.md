# Tema compartido y atmósfera de nubes en todas las páginas

**Fecha:** 2026-08-27
**Estado:** aprobado, pendiente de plan de implementación

## Problema

El fondo de nubes ("atmósfera") y el modo claro/oscuro viven hoy dentro de
`Dashboard.tsx` / `Dashboard.css`:

- El estado del tema es un `useState` local en `Dashboard` que lee/escribe
  `localStorage['dash-theme']`. Ninguna otra página lo conoce.
- La atmósfera es el `<div className="dash__atmos">` con su `<img>`, más las
  reglas `.dash__atmos` / `.dash__atmos-img` en `Dashboard.css`.
- `Gallery.tsx` (`/bocetos`) **solo tiene modo oscuro**: `Gallery.css` no tiene
  ninguna regla clara y no renderiza la atmósfera.

Se van a crear más páginas (Citas, Cotizaciones, Inventario, Previsualización
3D, Configuración). Todas deben tener modo claro y oscuro y mostrar la misma
atmósfera de fondo, sin volver a copiar la lógica.

## Objetivo

1. Un sistema de tema global y reutilizable (claro/oscuro con botón manual).
2. La atmósfera de nubes como componente compartido, visible en todas las
   páginas de la app autenticada, en la variante que corresponda al tema.
3. Modo claro completo para la Galería (`/bocetos`).
4. Una convención simple para que cada página futura herede ambas cosas.

Fuera de alcance: las páginas de autenticación (`Login`, `Register`,
`ForgotPassword`, `ResetPassword`) siguen con su propio tratamiento
(`AuthStage`); no entran en este cambio.

## Diseño

### 1. Sistema de tema — `frontend/src/lib/theme.tsx`

Módulo nuevo. Expone:

- `ThemeProvider` — componente que envuelve la app (dentro de `BrowserRouter`,
  en `App.tsx`). Mantiene `light: boolean`.
  - Estado inicial: `localStorage.getItem('dash-theme') === 'light'` (por
    defecto oscuro, igual que hoy).
  - Efecto: escribe `document.documentElement.dataset.theme = light ? 'light'
    : 'dark'` y `localStorage.setItem('dash-theme', ...)` en cada cambio.
  - Escucha el evento `storage` de `window`: si `dash-theme` cambió en otra
    pestaña, actualiza el estado (sincronización entre pestañas).
- `useTheme()` — hook que devuelve `{ light: boolean, toggle: () => void }`.
  Lanza si se usa fuera del `ThemeProvider`.

Se conserva la clave `localStorage` `dash-theme` y sus valores `'light'` /
`'dark'`: la preferencia ya guardada por el usuario se respeta sin migración.

### 2. Sin parpadeo — `frontend/index.html`

Script inline síncrono en el `<head>`, antes del bundle:

```html
<script>
  try {
    document.documentElement.dataset.theme =
      localStorage.getItem('dash-theme') === 'light' ? 'light' : 'dark';
  } catch (_) {
    document.documentElement.dataset.theme = 'dark';
  }
</script>
```

Así `data-theme` está puesto antes del primer render y no hay salto de color
al cargar. `ThemeProvider` solo sincroniza el estado de React con lo que el
script ya dejó.

### 3. Atmósfera — `frontend/src/components/Atmos.tsx` + `Atmos.css`

- `Atmos.tsx`: renderiza el contenedor fijo del arco y una `<img>`. Lee el
  tema con `useTheme()` y elige `src`:
  - oscuro → `/clouds-atmos-v2.webp`
  - claro → `/japanese-atmos-v2.webp`
  - `alt=""`, `aria-hidden`, `width={800} height={1422}`, `fetchPriority="high"`.
- `Atmos.css`: se mueven aquí las reglas hoy en `Dashboard.css` líneas ~31–53,
  renombradas:
  - `.dash__atmos` → `.atmos` (position fixed, arco con `mask-image`,
    `opacity: 0.55`, z-index 0).
  - `.dash__atmos-img` → `.atmos__img` (`object-fit: cover`,
    `filter: grayscale(1) brightness(0.7) contrast(1.06)`).
  - El tratamiento es el mismo en claro y oscuro (ya se unificó antes), así
    que `Atmos.css` no necesita reglas `[data-theme]`; solo cambia el `src`.
- La regla `@media (prefers-reduced-motion: reduce) { .dash__atmos { display:
  none; } }` pasa a `.atmos`.

### 4. Botón de tema — `frontend/src/components/ThemeToggle.tsx`

- Botón que llama a `toggle()` de `useTheme()`.
- Muestra icono luna en claro / sol en oscuro (mismos paths SVG que el objeto
  `icons` de `Dashboard.tsx`).
- `aria-pressed={light}`, `aria-label` y `title` dinámicos ("Cambiar a modo
  oscuro" / "Cambiar a modo claro").
- Acepta `className` opcional para que cada página lo posicione con su propio
  estilo (el Dashboard ya tiene `.dash__iconbtn`; la Galería añadirá el suyo).

### 5. Migración del Dashboard

- `App.tsx`: `<ThemeProvider>` dentro de `<BrowserRouter>`, envolviendo al
  `<Suspense>`. No depende del router, pero así queda un único árbol.
- `Dashboard.tsx`:
  - Quitar `useState` del tema y `toggleTheme`; usar `const { light, toggle } =
    useTheme()`.
  - Quitar `cloudSrc` y el `<div className="dash__atmos">…`; renderizar
    `<Atmos />`.
  - El `<div className="dash …">` deja de añadir `dash--light` (el tema ahora
    va por `data-theme` en `<html>`). La clase `dash--nav-open` se mantiene.
  - El `<button>` del topbar se reemplaza por
    `<ThemeToggle className="dash__iconbtn" />`.
- `Dashboard.css`:
  - Borrar las reglas de `.dash__atmos` / `.dash__atmos-img` (movidas a
    `Atmos.css`).
  - Reescribir los 49 selectores `.dash--light X` como
    `[data-theme="light"] .dash X`. Cambio mecánico; el resultado visual es
    idéntico.
  - `.dash.dash--light` → `[data-theme="light"] .dash`.

### 6. Modo claro de la Galería

- `Gallery.tsx`:
  - Renderizar `<Atmos />` dentro de `.gal`.
  - Añadir `<ThemeToggle className="gal__toggle" />` alineado a la derecha de
    `.gal__top` (con `margin-left: auto` en el toggle o un separador), para que
    no compita con el botón "Panel" ni con los títulos.
- `Gallery.css`:
  - `.gal` pasa a `position: relative`; su contenido queda en `z-index: 1`
    sobre la atmósfera (mismo patrón que `.dash__main`).
  - Bloque nuevo `[data-theme="light"] .gal …` con la paleta washi (papel
    cálido `#efece6`/`#ebe8e1`, tinta `#3f434a`/`#1b1d21`, acento bermellón
    `#c0392f`) para:
    - `.gal__top` (fondo, borde, `backdrop-filter`)
    - `.gal__back`, `.gal__title`, `.gal__sub`
    - `.uploader`, `.uploader__h`
    - `.drop`, `.drop--over`, `.drop--filled`, `.drop__icon`, `.drop__label`,
      `.drop__hint`, `.drop__meta`
    - `.field__label`, `.field__input`, `.field__input--area`, `.field__hint`,
      `select`
    - `.btn`, `.btn--primary`
    - `.chip`, `.chip--on`, `.filters__tag`
    - `.grid-wrap__head`, `.card`, `.card__media`, `.card__title`,
      `.card__zone`, `.card__desc`, `.card__meta`, `.card__select`,
      `.card__del`, `.tag`
    - `.badge` y sus variantes por estado
    - `.state`, `.state--error`, `.alert`, `.notice`
  - Se toman como referencia los valores ya usados en
    `[data-theme="light"] .dash` para mantener coherencia entre páginas.

### 7. Convención para páginas futuras

Documentar en `CLAUDE.md` (sección Frontend) el patrón:

> Toda página de la app autenticada:
> 1. Renderiza `<Atmos />` una vez dentro de su contenedor raíz.
> 2. Usa `useTheme()` para el estado del tema; coloca `<ThemeToggle />` donde
>    corresponda.
> 3. Su contenedor raíz va `position: relative` con el contenido en
>    `z-index: 1`.
> 4. El estilo **oscuro es el base**; el claro se escribe con el prefijo
>    `[data-theme="light"] .mi-pagina …`.

## Componentes y sus límites

| Unidad | Qué hace | Cómo se usa | De qué depende |
|---|---|---|---|
| `lib/theme.tsx` | Fuente única del tema; persiste y sincroniza | `<ThemeProvider>` en `App`; `useTheme()` en componentes | `localStorage`, evento `storage` |
| `components/Atmos` | Pinta el fondo de nubes según el tema | `<Atmos />` una vez por página | `useTheme()`, webp en `public/` |
| `components/ThemeToggle` | Botón claro/oscuro | `<ThemeToggle className?=… />` | `useTheme()` |
| `index.html` script | Fija `data-theme` antes del primer paint | — | `localStorage` |

## Manejo de errores / casos borde

- `localStorage` no disponible (modo privado, etc.): el script inline y el
  `ThemeProvider` caen a `'dark'` sin romper.
- Evento `storage` con `newValue` nulo (se limpió la clave): se trata como
  `'dark'`.
- SSR / `window` indefinido: no aplica (Vite SPA puro), pero los accesos a
  `document` / `localStorage` van dentro de efectos o `try/catch`.

## Pruebas y verificación

No hay runner de tests en el frontend. Verificación:

- `cd frontend && npm run lint` sin errores nuevos.
- `cd frontend && npm run build` (tsc + vite) sin errores.
- Revisión visual en el navegador:
  - Dashboard en oscuro: idéntico a antes.
  - Dashboard en claro: idéntico a antes.
  - Galería en oscuro: idéntica a antes + atmósfera de fondo.
  - Galería en claro: paleta washi coherente con el Dashboard + atmósfera.
  - Cambiar el tema en una página y navegar a la otra: se mantiene.
  - Cambiar el tema en otra pestaña del navegador: se sincroniza.
  - Recargar con tema claro: sin parpadeo oscuro→claro.

## Archivos afectados

**Nuevos**
- `frontend/src/lib/theme.tsx`
- `frontend/src/components/Atmos.tsx`
- `frontend/src/components/Atmos.css`
- `frontend/src/components/ThemeToggle.tsx`
- `docs/superpowers/specs/2026-08-27-tema-compartido-y-atmosfera-design.md`

**Modificados**
- `frontend/index.html` — script anti-parpadeo
- `frontend/src/App.tsx` — `<ThemeProvider>`
- `frontend/src/pages/Dashboard.tsx` — `useTheme`, `<Atmos />`, `<ThemeToggle />`
- `frontend/src/pages/Dashboard.css` — `.dash--light` → `[data-theme="light"] .dash`; quitar reglas de atmósfera
- `frontend/src/pages/Gallery.tsx` — `<Atmos />`, `<ThemeToggle />`
- `frontend/src/pages/Gallery.css` — bloque de modo claro + capas de `z-index`
- `CLAUDE.md` — convención de páginas
