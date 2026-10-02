/**
 * Opciones de despliegue que lee el frontend (Vite las fija al compilar).
 *
 * `VITE_ALLOW_REGISTER=false` oculta el enlace «Crear cuenta». Es solo
 * cosmético: quien cierra de verdad el registro es el backend
 * (`ALLOW_REGISTER`), que responde 403 aunque alguien llegue a /registro.
 */
export const REGISTRATION_OPEN = import.meta.env.VITE_ALLOW_REGISTER !== 'false'
