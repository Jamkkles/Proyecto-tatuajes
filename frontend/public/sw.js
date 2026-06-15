// Service worker mínimo: cachea el app shell para que la PWA abra sin conexión.
// No intercepta llamadas a la API (otra-origin), que siempre van a la red.
const CACHE = 'ht-shell-v1';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg', '/favicon.svg'];

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
