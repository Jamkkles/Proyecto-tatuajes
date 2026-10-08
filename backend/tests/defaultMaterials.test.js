const { DEFAULT_MATERIALS, STOCK_FACTOR } = require('../src/data/defaultMaterials');
const { computeQuote } = require('../src/services/quoteEngine');
const { isInk } = require('../src/services/colorMatch');

// Los mismos límites que aplican el esquema y el controlador. Si el kit los
// rompiera, la base rechazaría la carga entera al registrar una cuenta.
const CATEGORIES = ['agujas', 'tintas', 'proteccion', 'higiene', 'papeleria', 'cuidado', 'maquinas', 'otros'];
const UNITS = ['unidad', 'caja', 'par', 'ml', 'rollo', 'hoja', 'metro', 'set'];
const BASES = ['area', 'sesion', 'hora', 'ninguno'];

// El kit tal como lo vería el cotizador: filas de `materials`.
const rows = DEFAULT_MATERIALS.map((m, i) => ({
  id: `m${i}`,
  name: m.name,
  category: m.category,
  unit: m.unit,
  consumption_basis: m.consumptionBasis,
  consumption_rate: m.consumptionRate,
  unit_cost: m.unitCost,
  color_hex: m.colorHex,
}));

const find = (result, pattern) => result.items.filter((i) => pattern.test(i.name));

describe('kit básico de insumos', () => {
  test('cada insumo cumple lo que acepta la base de datos', () => {
    for (const m of DEFAULT_MATERIALS) {
      expect(m.name.trim()).not.toBe('');
      expect(CATEGORIES).toContain(m.category);
      expect(UNITS).toContain(m.unit);
      expect(BASES).toContain(m.consumptionBasis);
      expect(Number.isInteger(m.quantity) && m.quantity >= 0).toBe(true);
      expect(Number.isInteger(m.minQuantity) && m.minQuantity >= 0).toBe(true);
      expect(Number.isInteger(m.unitCost) && m.unitCost >= 0).toBe(true);
      expect(m.consumptionRate).toBeGreaterThanOrEqual(0);
      if (m.colorHex !== null) expect(m.colorHex).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  test('no repite nombres, ni siquiera sin distinguir mayúsculas', () => {
    // La carga compara por nombre en minúsculas: dos iguales se comerían entre sí.
    const names = DEFAULT_MATERIALS.map((m) => m.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  test('todo lo que trae se consume tatuando: nada de máquinas ni equipo', () => {
    for (const m of DEFAULT_MATERIALS) {
      expect(m.consumptionBasis).not.toBe('ninguno');
      expect(m.consumptionRate).toBeGreaterThan(0);
      expect(m.category).not.toBe('maquinas');
    }
  });

  test('arranca sobre el nivel crítico, para no llenar el inventario de alertas', () => {
    for (const m of DEFAULT_MATERIALS) {
      expect(m.quantity).toBe(m.minQuantity * STOCK_FACTOR);
      expect(m.quantity).toBeGreaterThan(m.minQuantity);
    }
  });

  test('las tintas de color traen su color y el resto no', () => {
    for (const m of DEFAULT_MATERIALS.filter((x) => x.category === 'tintas' && x.consumptionBasis === 'area')) {
      expect(m.colorHex).not.toBeNull();
    }
    // Las copitas son de la categoría tintas pero se gastan por sesión.
    const copitas = DEFAULT_MATERIALS.find((m) => m.name === 'Copitas de tinta');
    expect(copitas.colorHex).toBeNull();
    expect(isInk({ consumption_basis: copitas.consumptionBasis, category: copitas.category, color_hex: null })).toBe(false);
  });

  describe('cotizando con el kit', () => {
    const base = { widthCm: 10, heightCm: 10, inkRatio: 0.5 };

    test('un diseño en blanco y negro solo cobra tinta negra', () => {
      for (const colorMode of ['negro', 'grises']) {
        const result = computeQuote({ ...base, colorMode, materials: rows });
        const tintas = find(result, /^Tinta /);
        expect(tintas.map((t) => t.name)).toEqual(['Tinta negra 30 ml']);
        expect(result.missingInks).toEqual([]);
      }
    });

    test('cada color del boceto cobra su propia tinta, sin faltantes', () => {
      const result = computeQuote({
        ...base,
        colorMode: 'color',
        palette: [
          { hex: '#111111', share: 0.5 },
          { hex: '#c0392b', share: 0.25 },
          { hex: '#2255aa', share: 0.25 },
        ],
        materials: rows,
      });
      const nombres = find(result, /^Tinta /).map((t) => t.name).sort();
      expect(nombres).toEqual(['Tinta azul 15 ml', 'Tinta negra 30 ml', 'Tinta roja 15 ml']);
      expect(result.missingInks).toEqual([]);
      expect(find(result, /por comprar/)).toEqual([]);
    });

    test('no multiplica las agujas: una de línea y una de sombreado', () => {
      // Con las siete variantes del catálogo se cobrarían siete cartuchos por
      // tatuaje, porque el cotizador cobra todos los que tengan regla por tamaño.
      const result = computeQuote({ ...base, colorMode: 'negro', materials: rows });
      expect(find(result, /^Cartuchos/)).toHaveLength(2);
    });

    test('el costo de un tatuaje chico es razonable (no queda en cero ni se dispara)', () => {
      const { materialsCost } = computeQuote({ ...base, colorMode: 'negro', materials: rows });
      expect(materialsCost).toBeGreaterThan(2000);
      expect(materialsCost).toBeLessThan(25000);
    });
  });
});
