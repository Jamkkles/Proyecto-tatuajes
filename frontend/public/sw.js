// Service worker mínimo: cachea el app shell para que la PWA abra sin conexión.
// No intercepta llamadas a la API (otra-origin), que siempre van a la red.
// Sube el número cada vez que cambie algo de SHELL (íconos, manifest): esos
// archivos se sirven "caché primero", así que sin una versión nueva quien ya
// instaló la app seguiría viendo la anterior. El `activate` borra las versiones
// viejas.
const CACHE = 'tattoo-estudio-shell-v4';
// Si alguno de estos archivos no existe, `addAll` falla entero y el service worker
// no se instala: al renombrar o borrar un ícono hay que actualizar esta lista.
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon-192.png', '/favicon-32.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ---- Notificaciones push -------------------------------------------------------
// El servidor manda { id, title, body, url, tag }. iOS exige mostrar SIEMPRE una
// notificación al recibir un push (no admite avisos silenciosos), por eso no hay
// ningún camino de este evento que termine sin llamar a showNotification.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'Tattoo Estudio', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/favicon-32.png',
      // Con el id propio, dos avisos del mismo tipo (dos clientes por recordar) no
      // se pisan entre sí; solo se reemplazan si es exactamente el mismo aviso.
      tag: data.id || data.tag || undefined,
      data: { url: data.url || '/dashboard' },
    })
  );
});

// Tocar el aviso abre la app en la pantalla que corresponde: si ya hay una ventana
// abierta la lleva ahí, y si no, abre una.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  // Solo se abren rutas de la propia app: una URL absoluta de otro sitio, venga de
  // donde venga, se ignora y lleva al panel.
  let target = new URL('/dashboard', self.location.origin);
  try {
    const wanted = new URL(event.notification.data?.url || '/dashboard', self.location.origin);
    if (wanted.origin === self.location.origin) target = wanted;
  } catch {
    // URL mal formada: se queda con el panel.
  }
  target = target.href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windows) => {
      for (const client of windows) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        await client.focus();
        if ('navigate' in client) await client.navigate(target).catch(() => {});
        return;
      }
      await self.clients.openWindow(target);
    })
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Solo gestionamos recursos del propio origen (el shell). La API queda fuera.
  if (url.origin !== self.location.origin) return;

  // Navegaciones: red primero, con fallback al shell cacheado.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/index.html')));
    return;
  }

  // Resto de assets: cache primero, luego red.
  event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
});
