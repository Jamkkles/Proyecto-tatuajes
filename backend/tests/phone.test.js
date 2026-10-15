const { normalizePhone, waLink } = require('../src/utils/phone');
const { dateLabel, timeLabel, epochSeconds } = require('../src/utils/chileTime');

describe('normalizePhone', () => {
  test.each([
    ['+56 9 1234 5678', '56912345678'],
    ['9 1234 5678', '56912345678'],
    ['912345678', '56912345678'],
    ['56912345678', '56912345678'],
    ['+569-1234-5678', '56912345678'],
    ['(9) 1234.5678', '56912345678'],
    ['0056912345678', '56912345678'],
  ])('«%s» es el celular chileno %s', (raw, expected) => {
    expect(normalizePhone(raw)).toBe(expected);
  });

  test.each([
    ['', 'vacío'],
    [null, 'null'],
    [undefined, 'undefined'],
    ['abc', 'sin dígitos'],
    ['12345678', 'ocho dígitos: ambiguo, mejor avisar que adivinar'],
    ['22345678', 'un fijo de 8 dígitos'],
    ['+56 2 2345 6789', 'un fijo de Santiago: no tiene WhatsApp'],
    ['56 12345678', 'un 56 que no es celular'],
    ['9123456', 'celular incompleto'],
    ['9123456789', 'celular con un dígito de más'],
  ])('«%s» se rechaza (%s)', (raw) => {
    expect(normalizePhone(raw)).toBeNull();
  });

  test('un número extranjero solo vale si trae + o 00', () => {
    expect(normalizePhone('+54 9 11 2345 6789')).toBe('5491123456789');
    expect(normalizePhone('0054 9 11 2345 6789')).toBe('5491123456789');
    // Sin el + no se sabe de qué país es, así que no se adivina.
    expect(normalizePhone('5491123456789')).toBeNull();
  });
});

describe('waLink', () => {
  test('arma el enlace con el mensaje codificado', () => {
    const link = waLink('56912345678', 'Hola Ana, ¿cómo estás? 100% listo');
    expect(link.startsWith('https://wa.me/56912345678?text=')).toBe(true);
    expect(decodeURIComponent(link.split('text=')[1])).toBe('Hola Ana, ¿cómo estás? 100% listo');
    // Sin espacios ni signos sueltos que rompan la URL.
    expect(link).not.toMatch(/\s/);
  });
});

describe('fechas en hora de Chile', () => {
  test('el cliente lee la hora de Chile, no la UTC', () => {
    // 18:30 UTC en octubre es 15:30 en Chile (verano, UTC-3).
    const octubre = new Date('2026-10-16T18:30:00Z');
    expect(timeLabel(octubre)).toBe('15:30');
    expect(dateLabel(octubre)).toBe('viernes 16 de octubre');
  });

  test('respeta el cambio de horario: en invierno Chile es UTC-4', () => {
    expect(timeLabel(new Date('2026-07-16T18:30:00Z'))).toBe('14:30');
  });

  test('la fecha puede cambiar de día respecto de UTC', () => {
    // 02:30 UTC del sábado es todavía viernes 23:30 en Chile.
    const d = new Date('2026-10-17T02:30:00Z');
    expect(dateLabel(d)).toBe('viernes 16 de octubre');
    expect(timeLabel(d)).toBe('23:30');
  });

  test('la hora va en 24 horas, sin «p. m.»', () => {
    expect(timeLabel(new Date('2026-10-16T23:05:00Z'))).toBe('20:05');
  });

  test('epochSeconds trunca a segundos enteros (es parte de la clave de deduplicación)', () => {
    expect(epochSeconds(new Date('2026-10-16T18:30:00.999Z'))).toBe(epochSeconds(new Date('2026-10-16T18:30:00.000Z')));
    expect(epochSeconds('2026-10-16T18:30:00Z')).toBe(1792175400);
  });
});
