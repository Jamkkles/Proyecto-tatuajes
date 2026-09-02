import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] })
  ],
  build: {
    // three.js queda aislado en el chunk de `tattooViewer` (~670 KB), que solo
    // se descarga al entrar en /previsualizacion. El aviso por defecto a los
    // 500 KB no aporta nada aquí: el reparto ya es el que queremos.
    chunkSizeWarningLimit: 800,
  },
  server: {
    host: true,
    port: 5173,
    watch: {
      usePolling: true,
    },
    // El fallback a index.html para rutas del cliente (/bocetos, /nueva-contrasena)
    // ya viene activado por defecto en `appType: 'spa'`; declararlo aquí rompía
    // el typecheck porque no es una opción válida de `server`.
  },
})
