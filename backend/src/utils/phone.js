/**
 * Teléfonos para WhatsApp.
 *
 * La API de WhatsApp pide el número completo, solo dígitos y con código de país
 * (56912345678), y en la ficha del cliente cada artista lo escribe como quiere:
 * «+56 9 1234 5678», «9 1234 5678», «912345678», «56912345678».
 *
 * Sin código de país se asume Chile, y solo se aceptan celulares (9 dígitos que
 * empiezan con 9): un fijo no tiene WhatsApp, y un número de 8 dígitos es
 * ambiguo (¿falta el 9 o falta el código de área?), así que es mejor avisar que
 * el teléfono no sirve que escribirle a un desconocido.
 */
function normalizePhone(raw) {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim();
  if (!text) return null;

  let digits = text.replace(/\D/g, '');
  let international = text.startsWith('+');
  if (digits.startsWith('00')) {
    digits = digits.slice(2);
    international = true;
  }
  if (!digits) return null;

  // Chile: celular de 9 dígitos, con o sin el 56 por delante.
  if (/^9\d{8}$/.test(digits)) return `56${digits}`;
  if (/^569\d{8}$/.test(digits)) return digits;

  // Otro país: solo si el artista lo escribió con + (o 00), porque sin eso no se
  // sabe de qué país es. Un 56 que no es celular chileno se rechaza aquí.
  if (international && !digits.startsWith('56') && /^[1-9]\d{7,14}$/.test(digits)) return digits;

  return null;
}

/** Enlace que abre el chat de WhatsApp con el mensaje ya escrito. */
function waLink(phoneDigits, text) {
  return `https://wa.me/${phoneDigits}?text=${encodeURIComponent(text)}`;
}

module.exports = { normalizePhone, waLink };
