const { DEFAULT_MATERIALS, STOCK_FACTOR } = require('../src/data/defaultMaterials');
const { computeQuote } = require('../src/services/quoteEngine');
const { isInk } = require('../src/services/colorMatch');

// Los mismos límites que aplican el esquema y el controlador. Si el kit los
// rompiera, la base rechazaría la carga entera la primera vez que alguien entra.
const CATEGORIES = ['agujas', 'tintas', 'proteccion', 'higiene', 'papeleria', 'cuidado', 'maquinas', 'otros'];
const UNITS = ['unidad', 'caja', 'par', 'ml', 'rollo', 'hoja', 'metro', 'set'];
const BASES = ['area', 'sesion', 'hora', 'ninguno'];

const activos = DEFAULT_MATERIALS.filter((m) => m.consumptionBasis !== 'ninguno');
const apagados = DEFAULT_MATERIALS.filter((m) => m.consumptionBasis === 'ninguno');

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

describe('inventario inicial', () => {
  test('trae de todo un poco: todas las categorías', () => {
    const categorias = new Set(DEFAULT_MATERIALS.map((m) => m.category));
    expect([...categorias].sort()).toEqual([...CATEGORIES].sort());
    expect(DEFAULT_MATERIALS.length).toBeGreaterThanOrEqual(40);
  });

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
      if (m.notes !== null) expect(m.notes.length).toBeLessThanOrEqual(2000);
    }
  });

  test('no repite nombres, ni siquiera sin distinguir mayúsculas', () => {
    // La carga compara por nombre en minúsculas: dos iguales se comerían entre sí.
    const names = DEFAULT_MATERIALS.map((m) => m.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  test('nada arranca en alerta de nivel crítico', () => {
    for (const m of DEFAULT_MATERIALS) {
      expect(m.quantity).toBeGreaterThan(m.minQuantity);
    }
    // Los que se gastan parten del doble del mínimo; los equipos, de uno.
    for (const m of activos) expect(m.quantity).toBe(m.minQuantity * STOCK_FACTOR);
  });

  test('las tintas de color traen su color y el resto no', () => {
    for (const m of DEFAULT_MATERIALS.filter((x) => x.category === 'tintas' && x.consumptionBasis === 'area')) {
      expect(m.colorHex).not.toBeNull();
    }
    for (const m of DEFAULT_MATERIALS.filter((x) => x.category !== 'tintas')) {
      expect(m.colorHex).toBeNull();
    }
    // Las copitas son de la categoría tintas pero se gastan por sesión.
    const copitas = DEFAULT_MATERIALS.find((m) => m.name === 'Copitas de tinta');
    expect(copitas.colorHex).toBeNull();
    expect(isInk({ consumption_basis: copitas.consumptionBasis, category: copitas.category, color_hex: null })).toBe(false);
  });

  describe('lo que entra en las cotizaciones', () => {
    test('los equipos no se consumen tatuando', () => {
      for (const m of DEFAULT_MATERIALS.filter((x) => x.category === 'maquinas')) {
        expect(m.consumptionBasis).toBe('ninguno');
        expect(m.consumptionRate).toBe(0);
      }
    });

    test('cada alternativa apagada explica cómo encenderla', () => {
      const alternativas = apagados.filter((m) => m.category !== 'maquinas' && m.consumptionRate > 0);
      expect(alternativas.length).toBeGreaterThanOrEqual(7);
      for (const m of alternativas) {
        // La nota es lo único que le dice al artista por qué no aparece en las
        // cotizaciones y qué tasa poner: al guardar el formulario la tasa se borra.
        expect(m.notes).toMatch(/Se gasta/);
        expect(m.notes).toMatch(/tasa sugerida: \d/);
      }
    });

    test('de cada familia intercambiable queda una sola activa', () => {
      const nombres = activos.map((m) => m.name);
      const agujas = activos.filter((m) => m.category === 'agujas');
      expect(agujas).toHaveLength(2); // uno de línea y uno de sombreado
      // Un solo papel de transfer; el gel del stencil es un complemento, no otro papel.
      expect(nombres.filter((n) => /^Papel/i.test(n))).toEqual(['Papel hectográfico (transfer)']);
      expect(nombres).toContain('Papel hectográfico (transfer)');
      expect(nombres).not.toContain('Papel térmico para impresora');
      expect(nombres.filter((n) => /^Film|Segunda piel/i.test(n))).toHaveLength(2);
    });
  });

  describe('cotizando con el inventario inicial', () => {
    const base = { widthCm: 10, heightCm: 10, inkRatio: 0.5 };

    test('un diseño en blanco y negro solo cobra tinta negra', () => {
      for (const colorMode of ['negro', 'grises']) {
        const result = computeQuote({ ...base, colorMode, materials: rows });
        expect(find(result, /^Tinta /).map((t) => t.name)).toEqual(['Tinta negra 30 ml']);
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
      expect(find(result, /^Tinta /).map((t) => t.name).sort()).toEqual([
        'Tinta azul 15 ml',
        'Tinta negra 30 ml',
        'Tinta roja 15 ml',
      ]);
      expect(result.missingInks).toEqual([]);
      expect(find(result, /por comprar/)).toEqual([]);
    });

    test('tener las siete variantes de cartucho no cobra siete agujas', () => {
      // Era el problema de cargar el catálogo entero con todas sus reglas
      // encendidas: el cotizador cobra todo lo que tenga regla por tamaño.
      const result = computeQuote({ ...base, colorMode: 'negro', materials: rows });
      expect(rows.filter((r) => r.category === 'agujas')).toHaveLength(7);
      expect(find(result, /^Cartuchos|^Agujas/)).toHaveLength(2);
    });

    test('lo apagado no aparece en la cotización, ni siquiera la máquina de 120 mil', () => {
      const result = computeQuote({ ...base, colorMode: 'negro', materials: rows });
      const cobrados = result.items.map((i) => i.name);
      for (const m of apagados) expect(cobrados).not.toContain(m.name);
    });

    test('el costo de un tatuaje chico es razonable', () => {
      const { materialsCost } = computeQuote({ ...base, colorMode: 'negro', materials: rows });
      expect(materialsCost).toBeGreaterThan(2000);
      expect(materialsCost).toBeLessThan(25000);
    });
  });
});
