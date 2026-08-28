import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Registro del service worker solo en build de producción para no interferir
// con el hot-reload de Vite durante el desarrollo.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* sin SW la app sigue funcionando, solo pierde el modo offline */
    })
  })
}

// En desarrollo: si quedó un service worker de una build de producción previa
// (nginx), sigue interceptando las peticiones y sirve assets viejos en caché.
// Lo desregistramos, vaciamos sus cachés y recargamos una sola vez.
if ('serviceWorker' in navigator && import.meta.env.DEV) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    if (!regs.length) return
    Promise.all(regs.map((r) => r.unregister()))
      .then(() => caches.keys())
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => window.location.reload())
  })
}
