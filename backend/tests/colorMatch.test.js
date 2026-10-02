const {
  allocateByMode,
  allocatePalette,
  hexToOklab,
  matchInk,
  prepareInks,
} = require('../src/services/colorMatch');

// Inventario de referencia: las tintas que casi cualquier estudio tiene.
const INVENTARIO = [
  { id: 'negra', name: 'Tinta negra', color_hex: '#111111' },
  { id: 'blanca', name: 'Tinta blanca', color_hex: '#fafafa' },
  { id: 'roja', name: 'Tinta roja', color_hex: '#c0392b' },
  { id: 'azul', name: 'Tinta azul', color_hex: '#2255aa' },
  { id: 'verde', name: 'Tinta verde', color_hex: '#2e8b57' },
  { id: 'amarilla', name: 'Tinta amarilla', color_hex: '#e6b800' },
];

const inks = prepareInks(INVENTARIO);
const match = (hex) => matchInk(hex, inks)?.material?.id ?? null;

describe('Emparejamiento de color con el inventario (HU14)', () => {
  describe('lectura del hex', () => {
    test('acepta un color válido con y sin almohadilla', () => {
      expect(hexToOklab('#c0392b')).not.toBeNull();
      expect(hexToOklab('c0392b')).not.toBeNull();
    });

    test('rechaza lo que no es un color', () => {
      for (const malo of ['', null, undefined, 'rojo', '#fff', '#12345g']) {
        expect(hexToOklab(malo)).toBeNull();
      }
    });

    test('ignora los insumos sin color al preparar el inventario', () => {
      expect(prepareInks([{ id: 'x', color_hex: null }, { id: 'y', color_hex: '#000000' }]))
        .toHaveLength(1);
    });
  });

  describe('tonos de una misma tinta', () => {
    test('un rojo claro y uno oscuro son la misma tinta roja', () => {
      expect(match('#e74c3c')).toBe('roja');
      expect(match('#a93226')).toBe('roja');
    });

    test('un turquesa se resuelve con la tinta verde', () => {
      expect(match('#16a085')).toBe('verde');
    });
  });

  describe('grises y blanco', () => {
    // Al tatuar, los grises se consiguen rebajando el negro, no mezclando
    // blanco. Y una tinta blanca sobre un lienzo blanco es indetectable.
    test('todos los grises van a la tinta negra', () => {
      for (const gris of ['#000000', '#2f2f2f', '#6f6f6f', '#9b9b9b']) {
        expect(match(gris)).toBe('negra');
      }
    });

    test('la tinta blanca nunca se asigna sola', () => {
      const asignadas = ['#000000', '#6f6f6f', '#c0392b', '#2255aa'].map(match);
      expect(asignadas).not.toContain('blanca');
    });

    test('un casi-negro cálido va al negro, un café medio no', () => {
      expect(match('#281913')).toBe('negra');
      expect(match('#4c362d')).not.toBe('negra');
    });

    test('sin tinta oscura, un gris no se empareja con nada', () => {
      const soloColores = prepareInks(INVENTARIO.filter((i) => i.id !== 'negra'));
      expect(matchInk('#2f2f2f', soloColores)).toBeNull();
    });
  });

  describe('colores que el estudio no tiene', () => {
    test('un morado no se hace pasar por azul', () => {
      expect(match('#8e44ad')).toBeNull();
    });

    test('un rosa no se hace pasar por rojo', () => {
      expect(match('#ff69b4')).toBeNull();
    });
  });

  describe('reparto sin paleta, según el modo de color', () => {
    const tinta = (id, name, color) => ({
      id,
      name,
      category: 'tintas',
      color_hex: color,
      consumption_basis: 'area',
    });
    const suma = (shares) => [...shares.values()].reduce((a, b) => a + b, 0);

    test('en negro solo entra la tinta oscura', () => {
      const { shares } = allocateByMode(
        [tinta('n', 'negra', '#111111'), tinta('r', 'roja', '#c0392b')],
        'negro'
      );
      expect(shares.get('n')).toBe(1);
      expect(shares.has('r')).toBe(false);
    });

    test('una tinta sin color declarado puede ser el negro; una roja no', () => {
      // Sin esto, un tatuaje en negro acababa cotizando la tinta roja por ser
      // el único color que el inventario había declarado.
      const { shares } = allocateByMode(
        [tinta('n', 'negra', null), tinta('r', 'roja', '#c0392b')],
        'negro'
      );
      expect(shares.get('n')).toBe(1);
      expect(shares.has('r')).toBe(false);
    });

    test('a color, el negro lleva la mitad y los colores la otra mitad', () => {
      const { shares } = allocateByMode(
        [tinta('n', 'negra', '#111111'), tinta('r', 'roja', '#c0392b'), tinta('a', 'amarilla', '#e6b800')],
        'color'
      );
      expect(shares.get('n')).toBe(0.5);
      expect(shares.get('r')).toBe(0.25);
      expect(shares.get('a')).toBe(0.25);
    });

    test.each([
      ['negro', [tinta('n', 'negra', '#111111'), tinta('r', 'roja', '#c0392b')]],
      ['color', [tinta('n', 'negra', '#111111'), tinta('r', 'roja', '#c0392b')]],
      ['negro', [tinta('n', 'negra', null), tinta('g', 'grises', null)]],
      ['color', [tinta('r', 'roja', '#c0392b'), tinta('a', 'amarilla', '#e6b800')]],
    ])('en modo "%s" las partes siempre suman 1', (colorMode, inventario) => {
      expect(suma(allocateByMode(inventario, colorMode).shares)).toBeCloseTo(1, 10);
    });

    test('un insumo que se gasta por sesión no entra en el reparto', () => {
      const copitas = { id: 'c', category: 'tintas', consumption_basis: 'sesion' };
      const { shares } = allocateByMode([tinta('n', 'negra', '#111111'), copitas], 'negro');
      expect(shares.has('c')).toBe(false);
    });

    test('sin tintas, no se reparte nada', () => {
      expect(allocateByMode([{ id: 'x', category: 'agujas', consumption_basis: 'area' }], 'negro').shares.size).toBe(0);
    });
  });

  describe('reparto del área', () => {
    test('reparte cada color a su tinta y suma los repetidos', () => {
      const { shares, missing } = allocatePalette(
        [
          { hex: '#1a1a1a', share: 0.45 },
          { hex: '#6f6f6f', share: 0.1 },
          { hex: '#d0392b', share: 0.3 },
          { hex: '#f0c419', share: 0.15 },
        ],
        INVENTARIO
      );

      // Negro y gris son la misma tinta: 0,45 + 0,10.
      expect(shares.get('negra')).toBeCloseTo(0.55, 5);
      expect(shares.get('roja')).toBeCloseTo(0.3, 5);
      expect(shares.get('amarilla')).toBeCloseTo(0.15, 5);
      expect(missing).toEqual([]);
    });

    test('una tinta que el diseño no usa no recibe área', () => {
      const { shares } = allocatePalette([{ hex: '#050505', share: 1 }], INVENTARIO);
      expect(shares.get('negra')).toBe(1);
      expect(shares.has('azul')).toBe(false);
      expect(shares.has('roja')).toBe(false);
    });

    test('el área de un color faltante no se reparte entre las demás', () => {
      const { shares, missing } = allocatePalette(
        [{ hex: '#111111', share: 0.5 }, { hex: '#8e44ad', share: 0.5 }],
        INVENTARIO
      );
      expect(shares.get('negra')).toBe(0.5);
      expect(missing).toEqual([{ hex: '#8e44ad', share: 0.5 }]);
      // La mitad morada no se le carga al negro.
      expect([...shares.values()].reduce((a, b) => a + b, 0)).toBe(0.5);
    });

    test('una paleta vacía o sin inventario no reparte nada', () => {
      expect(allocatePalette([], INVENTARIO).shares.size).toBe(0);
      expect(allocatePalette(null, INVENTARIO).shares.size).toBe(0);
      expect(allocatePalette([{ hex: '#c0392b', share: 1 }], []).missing).toHaveLength(1);
    });

    test('ignora entradas con una parte no válida', () => {
      const { shares } = allocatePalette(
        [{ hex: '#111111', share: 0 }, { hex: '#c0392b', share: NaN }, { hex: '#2255aa', share: 1 }],
        INVENTARIO
      );
      expect([...shares.keys()]).toEqual(['azul']);
    });
  });
});
