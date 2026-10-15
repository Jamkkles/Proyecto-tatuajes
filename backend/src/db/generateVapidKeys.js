// Genera el par de claves VAPID de las notificaciones push.
// Uso: npm run vapid:generate
//
// Se hace una sola vez y las claves no se cambian después: al cambiarlas, los
// dispositivos que ya se suscribieron dejan de recibir avisos hasta que vuelvan a
// activarlos. La privada es un secreto: va solo en las variables de entorno del
// servidor, nunca en el repositorio.
const webpush = require('web-push');

const { publicKey, privateKey } = webpush.generateVAPIDKeys();

console.log('Copia estas dos líneas en las variables de entorno del servidor:\n');
console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
console.log('\nLa privada es un secreto: no la compartas ni la subas a Git.');
