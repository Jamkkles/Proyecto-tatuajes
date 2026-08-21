import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] })
  ],
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
