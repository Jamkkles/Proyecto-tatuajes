const crypto = require('crypto');

// Sin letras ni números que se confundan al dictarlos o copiarlos a mano (l/1/i, o/0).
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

/**
 * Contraseña temporal que el administrador le entrega a un tatuador (HU33, HU38):
 * «k7mq-x3vt-9pah». 12 caracteres al azar de 31 posibles (unos 59 bits): difícil de
 * adivinar y fácil de dictar.
 */
function tempPassword() {
  const groups = [];
  for (let g = 0; g < 3; g += 1) {
    let part = '';
    for (let i = 0; i < 4; i += 1) part += ALPHABET[crypto.randomInt(ALPHABET.length)];
    groups.push(part);
  }
  return groups.join('-');
}

module.exports = { tempPassword, ALPHABET };
