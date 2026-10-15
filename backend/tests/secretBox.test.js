const { encrypt, decrypt, hasKey, SecretBoxError } = require('../src/utils/secretBox');

const ENV = { WHATSAPP_AUTH_KEY: 'k'.repeat(40) };

describe('hasKey', () => {
  test('hace falta una clave larga', () => {
    expect(hasKey({})).toBe(false);
    expect(hasKey({ WHATSAPP_AUTH_KEY: 'corta' })).toBe(false);
    expect(hasKey({ WHATSAPP_AUTH_KEY: ' '.repeat(40) })).toBe(false);
    expect(hasKey(ENV)).toBe(true);
  });
});

describe('encrypt / decrypt', () => {
  test('lo que se cifra se descifra igual', () => {
    const texto = JSON.stringify({ clave: 'a1b2', n: 3, acentos: 'ñandú' });
    expect(decrypt(encrypt(texto, ENV), ENV)).toBe(texto);
  });

  test('el texto cifrado no contiene el original', () => {
    const token = encrypt('secreto-de-whatsapp', ENV);
    expect(token).not.toContain('secreto');
    expect(Buffer.from(token.split('.')[3], 'base64').toString('utf8')).not.toContain('secreto');
    expect(token.startsWith('v1.')).toBe(true);
  });

  test('cifrar dos veces lo mismo da resultados distintos (vector de inicio aleatorio)', () => {
    expect(encrypt('igual', ENV)).not.toBe(encrypt('igual', ENV));
  });

  test('con otra clave no se descifra', () => {
    const token = encrypt('x', ENV);
    expect(() => decrypt(token, { WHATSAPP_AUTH_KEY: 'otra-clave-distinta-de-treinta-y-dos-caracteres' })).toThrow(SecretBoxError);
  });

  test('un valor alterado en la base falla en vez de descifrarse en silencio', () => {
    const [v, iv, tag, data] = encrypt('importante', ENV).split('.');
    const alterado = Buffer.from(data, 'base64');
    alterado[0] ^= 1;
    expect(() => decrypt([v, iv, tag, alterado.toString('base64')].join('.'), ENV)).toThrow(/alterado/);
  });

  test('un formato desconocido se rechaza con un mensaje claro', () => {
    expect(() => decrypt('no-es-un-token', ENV)).toThrow(/formato/);
    expect(() => decrypt('v9.a.b.c', ENV)).toThrow(/formato/);
  });

  test('sin clave no cifra: nunca se guardaría algo en claro por descuido', () => {
    expect(() => encrypt('x', {})).toThrow(/WHATSAPP_AUTH_KEY/);
    expect(() => decrypt('v1.a.b.c', {})).toThrow(/WHATSAPP_AUTH_KEY/);
  });

  test('el texto vacío también se cifra', () => {
    expect(decrypt(encrypt('', ENV), ENV)).toBe('');
  });
});
