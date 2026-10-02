const {
  computeQuote,
  itemsCost,
  COBERTURA_POR_DEFECTO,
  MINUTOS_PREPARACION,
} = require('../src/services/quoteEngine');

/** El redondeo de la agenda; las comparaciones de tiempo le dan ese margen. */
const BLOQUE = 15;

// Inventario de referencia: uno de cada base de consumo, para poder comprobar
// que cada una escala como corresponde.
const CARTUCHOS = {
  id: 'm-1',
  name: 'Cartuchos RL 03',
  unit: 'unidad',
  unit_cost: 1200,
  consumption_basis: 'area',
  consumption_rate: 0.015,
};
const TINTA = {
  id: 'm-2',
  name: 'Tinta negra',
  unit: 'ml',
  unit_cost: 900,
  consumption_basis: 'area',
  consumption_rate: 0.05,
};
const GUANTES = {
  id: 'm-3',
  name: 'Guantes',
  unit: 'par',
  unit_cost: 400,
  consumption_basis: 'sesion',
  consumption_rate: 3,
};
const GASAS = {
  id: 'm-4',
  name: 'Gasas',
  unit: 'unidad',
  unit_cost: 150,
  consumption_basis: 'hora',
  consumption_rate: 4,
};
const MAQUINA = {
  id: 'm-5',
  name: 'Máquina rotativa',
  unit: 'unidad',
  unit_cost: 250000,
  consumption_basis: 'ninguno',
  consumption_rate: 0,
};

const MATERIALS = [CARTUCHOS, TINTA, GUANTES, GASAS, MAQUINA];

// Tintas con color declarado, para el reparto por paleta.
const NEGRA = { ...TINTA, id: 'm-n', name: 'Tinta negra', category: 'tintas', color_hex: '#111111' };
const ROJA = { ...TINTA, id: 'm-r', name: 'Tinta roja', category: 'tintas', unit_cost: 1100, color_hex: '#c0392b' };
const AMARILLA = { ...TINTA, id: 'm-a', name: 'Tinta amarilla', category: 'tintas', unit_cost: 1100, color_hex: '#e6b800' };
const CON_COLOR = [CARTUCHOS, NEGRA, ROJA, AMARILLA, GUANTES];

// Pieza mediana: 15 × 15 cm con 35% de cobertura → 78,75 cm² efectivos.
const MEDIANA = {
  widthCm: 15,
  heightCm: 15,
  inkRatio: 0.35,
  stroke: 'medio',
  colorMode: 'negro',
  sessionsCount: 1,
  materials: MATERIALS,
};

const find = (result, name) => result.items.find((i) => i.name === name);

describe('Motor de cotización (HU14)', () => {
  test('el área efectiva pondera el rectángulo por la cobertura de tinta', () => {
    const result = computeQuote(MEDIANA);
    expect(result.boundingArea).toBe(225);
    expect(result.effectiveArea).toBe(78.75);
  });

  test('un insumo con base "ninguno" no entra en la cotización', () => {
    expect(find(computeQuote(MEDIANA), 'Máquina rotativa')).toBeUndefined();
  });

  test('el costo total es la suma de los subtotales de cada línea', () => {
    const result = computeQuote(MEDIANA);
    const suma = result.items.reduce((total, i) => total + i.subtotal, 0);
    expect(result.materialsCost).toBe(suma);
    expect(itemsCost(result.items)).toBe(suma);
  });

  describe('bases de consumo', () => {
    test('la base "area" escala con el tamaño entintado', () => {
      const chica = computeQuote({ ...MEDIANA, widthCm: 5, heightCm: 5 });
      const grande = computeQuote({ ...MEDIANA, widthCm: 30, heightCm: 30 });
      expect(find(grande, 'Tinta negra').quantity).toBeGreaterThan(
        find(chica, 'Tinta negra').quantity
      );
    });

    test('la base "sesion" escala con las sesiones, no con el tamaño', () => {
      const una = computeQuote(MEDIANA);
      const tres = computeQuote({ ...MEDIANA, sessionsCount: 3 });
      expect(find(una, 'Guantes').quantity).toBe(3);
      expect(find(tres, 'Guantes').quantity).toBe(9);

      const grande = computeQuote({ ...MEDIANA, widthCm: 40, heightCm: 40 });
      expect(find(grande, 'Guantes').quantity).toBe(3);
    });

    test('la base "hora" escala con la duración estimada', () => {
      const result = computeQuote(MEDIANA);
      const horas = result.estimatedMinutes / 60;
      expect(find(result, 'Gasas').quantity).toBeCloseTo(4 * horas, 2);
    });
  });

  describe('variables de trazado', () => {
    test('un trazo más grueso gasta más material', () => {
      const fino = computeQuote({ ...MEDIANA, stroke: 'fino' });
      const grueso = computeQuote({ ...MEDIANA, stroke: 'grueso' });
      expect(find(grueso, 'Tinta negra').quantity).toBeGreaterThan(
        find(fino, 'Tinta negra').quantity
      );
    });

    test('un trazo fino toma más tiempo por ser de detalle', () => {
      const fino = computeQuote({ ...MEDIANA, stroke: 'fino' });
      const grueso = computeQuote({ ...MEDIANA, stroke: 'grueso' });
      expect(fino.estimatedMinutes).toBeGreaterThan(grueso.estimatedMinutes);
    });

    test('el color sube el material y el tiempo frente al negro', () => {
      const negro = computeQuote(MEDIANA);
      const color = computeQuote({ ...MEDIANA, colorMode: 'color' });
      expect(color.materialsCost).toBeGreaterThan(negro.materialsCost);
      expect(color.estimatedMinutes).toBeGreaterThan(negro.estimatedMinutes);
    });
  });

  describe('esterilidad y redondeos', () => {
    test('lo que escala con el área nunca baja de una unidad por sesión', () => {
      // Un lettering diminuto: sin el piso saldría en centésimas de cartucho,
      // y un cartucho no se puede comprar por partes ni reutilizar.
      const lettering = computeQuote({
        ...MEDIANA,
        widthCm: 4,
        heightCm: 1,
        inkRatio: 0.05,
      });
      expect(find(lettering, 'Cartuchos RL 03').quantity).toBe(1);
      expect(find(lettering, 'Tinta negra').quantity).toBe(1);
    });

    test('con varias sesiones el piso sube a una unidad por sesión', () => {
      const result = computeQuote({
        ...MEDIANA,
        widthCm: 4,
        heightCm: 1,
        inkRatio: 0.05,
        sessionsCount: 3,
      });
      expect(find(result, 'Cartuchos RL 03').quantity).toBe(3);
    });

    test('las cantidades por sesión conservan sus decimales', () => {
      // Medio rollo de film es un consumo real: redondearlo a un rollo
      // inflaría la cotización con material que no se gastó.
      const film = {
        id: 'm-6',
        name: 'Film',
        unit: 'rollo',
        unit_cost: 8000,
        consumption_basis: 'sesion',
        consumption_rate: 0.05,
      };
      const result = computeQuote({ ...MEDIANA, materials: [film] });
      expect(find(result, 'Film').quantity).toBe(0.05);
      expect(find(result, 'Film').subtotal).toBe(400);
    });

    test('ninguna sesión se estima en menos de media hora', () => {
      const result = computeQuote({
        ...MEDIANA,
        widthCm: 1,
        heightCm: 1,
        inkRatio: 0.01,
      });
      expect(result.estimatedMinutes).toBe(30);
    });

    test('el tiempo se redondea a bloques de 15 minutos', () => {
      expect(computeQuote(MEDIANA).estimatedMinutes % 15).toBe(0);
    });
  });

  test('un inventario sin reglas de consumo cotiza en cero', () => {
    const result = computeQuote({ ...MEDIANA, materials: [MAQUINA] });
    expect(result.items).toEqual([]);
    expect(result.materialsCost).toBe(0);
  });

  test('las líneas salen ordenadas de mayor a menor costo', () => {
    const subtotales = computeQuote(MEDIANA).items.map((i) => i.subtotal);
    expect([...subtotales].sort((a, b) => b - a)).toEqual(subtotales);
  });

  test('la cobertura por defecto es un valor razonable de diseño con relleno', () => {
    expect(COBERTURA_POR_DEFECTO).toBeGreaterThan(0);
    expect(COBERTURA_POR_DEFECTO).toBeLessThan(1);
  });

  describe('sesiones y tiempo', () => {
    // Sin `sessionsCount`, el motor las deduce del trabajo que pide la pieza.
    const sinSesiones = ({ widthCm, heightCm, inkRatio }) =>
      computeQuote({ widthCm, heightCm, inkRatio, materials: MATERIALS });

    test('las sesiones se deducen del trabajo, no hay que indicarlas', () => {
      const chica = sinSesiones({ widthCm: 5, heightCm: 5, inkRatio: 0.35 });
      const manga = sinSesiones({ widthCm: 31, heightCm: 60, inkRatio: 0.6 });
      expect(chica.sessionsCount).toBe(1);
      expect(manga.sessionsCount).toBeGreaterThan(5);
    });

    test('la cotización es del proyecto completo: más sesiones no agrandan el tatuaje', () => {
      // Una pieza grande, donde el piso de esterilidad no alcanza a notarse:
      // la tinta que pide el dibujo es exactamente la misma se haga en una
      // cita o en seis.
      const grande = { ...MEDIANA, widthCm: 30, heightCm: 30, inkRatio: 0.5 };
      const una = computeQuote({ ...grande, sessionsCount: 1 });
      const seis = computeQuote({ ...grande, sessionsCount: 6 });
      expect(find(seis, 'Tinta negra').quantity).toBe(find(una, 'Tinta negra').quantity);
      // El trabajo de aguja tampoco cambia: es el mismo tatuaje.
      expect(seis.workMinutes).toBe(una.workMinutes);
    });

    test('en una pieza chica las sesiones solo mueven el piso de esterilidad', () => {
      // Lo único que sube es que cada cita estrena cartucho y copita de tinta,
      // que se botan al terminar. No es el diseño multiplicándose.
      const una = computeQuote({ ...MEDIANA, sessionsCount: 1 });
      const cuatro = computeQuote({ ...MEDIANA, sessionsCount: 4 });
      const antes = find(una, 'Tinta negra').quantity;
      const despues = find(cuatro, 'Tinta negra').quantity;
      expect(despues).toBe(Math.max(antes, 4));
      // Y desde luego no se cuadruplica.
      expect(despues).toBeLessThan(antes * 2);
    });

    test('lo que sí crece con las sesiones es lo que se monta cada vez', () => {
      const una = computeQuote({ ...MEDIANA, sessionsCount: 1 });
      const cuatro = computeQuote({ ...MEDIANA, sessionsCount: 4 });
      expect(find(cuatro, 'Guantes').quantity).toBe(find(una, 'Guantes').quantity * 4);
      // Y el tiempo, por la preparación de cada cita.
      expect(cuatro.estimatedMinutes).toBeGreaterThan(una.estimatedMinutes);
    });

    test('el tiempo incluye la preparación de cada sesión', () => {
      const result = computeQuote({ ...MEDIANA, sessionsCount: 2 });
      expect(result.estimatedMinutes).toBeGreaterThanOrEqual(
        result.workMinutes + MINUTOS_PREPARACION * 2 - BLOQUE
      );
    });

    test('una pieza chica no sale más rápida que su preparación', () => {
      // El modelo lineal la daba en 18 minutos; calcar y montar ya toma más.
      const result = sinSesiones({ widthCm: 5, heightCm: 5, inkRatio: 0.35 });
      expect(result.estimatedMinutes).toBeGreaterThanOrEqual(MINUTOS_PREPARACION);
    });

    test('las sesiones acordadas a mano mandan sobre las deducidas', () => {
      const result = computeQuote({
        widthCm: 31,
        heightCm: 60,
        inkRatio: 0.6,
        sessionsCount: 3,
        materials: MATERIALS,
      });
      expect(result.sessionsCount).toBe(3);
    });

    test('los tiempos de las piezas conocidas caen donde el oficio dice', () => {
      // Media manga en negro y gris: el oficio la sitúa en torno a 15 horas.
      const mediaManga = sinSesiones({ widthCm: 30, heightCm: 30, inkRatio: 0.5 });
      expect(mediaManga.workMinutes / 60).toBeGreaterThan(12);
      expect(mediaManga.workMinutes / 60).toBeLessThan(18);
      expect(mediaManga.sessionsCount).toBeGreaterThanOrEqual(2);
      expect(mediaManga.sessionsCount).toBeLessThanOrEqual(4);

      // Manga completa: 30–40 horas es lo típico, en 5–10 citas.
      const manga = sinSesiones({ widthCm: 31, heightCm: 60, inkRatio: 0.6 });
      expect(manga.workMinutes / 60).toBeGreaterThan(25);
      expect(manga.workMinutes / 60).toBeLessThan(45);
      expect(manga.sessionsCount).toBeLessThanOrEqual(10);
    });
  });

  describe('reparto por los colores del boceto', () => {
    const GRANDE = { ...MEDIANA, widthCm: 20, heightCm: 20, inkRatio: 0.4, materials: CON_COLOR };
    const PALETA = [
      { hex: '#1a1a1a', share: 0.5 },
      { hex: '#d0392b', share: 0.3 },
      { hex: '#f0c419', share: 0.2 },
    ];

    test('sin paleta y en negro, solo se cotiza la tinta oscura', () => {
      // El caso que el artista reportó: un tatuaje en blanco y negro no puede
      // salir cotizando tinta roja y amarilla.
      const result = computeQuote({ ...GRANDE, colorMode: 'negro' });
      expect(find(result, 'Tinta negra')).toBeDefined();
      expect(find(result, 'Tinta roja')).toBeUndefined();
      expect(find(result, 'Tinta amarilla')).toBeUndefined();
    });

    test('sin paleta y en grises, tampoco entran los colores', () => {
      const result = computeQuote({ ...GRANDE, colorMode: 'grises' });
      expect(find(result, 'Tinta roja')).toBeUndefined();
      expect(find(result, 'Tinta amarilla')).toBeUndefined();
    });

    test('sin paleta y a color, el negro lleva la mitad y el resto se reparte', () => {
      const result = computeQuote({ ...GRANDE, colorMode: 'color' });
      expect(find(result, 'Tinta negra')).toBeDefined();
      expect(find(result, 'Tinta roja')).toBeDefined();
      expect(find(result, 'Tinta amarilla')).toBeDefined();
      // El rojo y el amarillo se parten la otra mitad en partes iguales.
      expect(find(result, 'Tinta roja').quantity).toBe(find(result, 'Tinta amarilla').quantity);
    });

    test('con paleta, cada tinta recibe su parte del diseño', () => {
      const result = computeQuote({ ...GRANDE, palette: PALETA });
      const negra = find(result, 'Tinta negra').quantity;
      const roja = find(result, 'Tinta roja').quantity;
      const amarilla = find(result, 'Tinta amarilla').quantity;

      expect(negra).toBeGreaterThan(roja);
      expect(roja).toBeGreaterThan(amarilla);
      // Las proporciones siguen a la paleta: 0,5 / 0,3 / 0,2.
      expect(roja / negra).toBeCloseTo(0.6, 2);
      expect(amarilla / negra).toBeCloseTo(0.4, 2);
    });

    test('la paleta medida manda sobre el modo de color elegido a mano', () => {
      // El artista marcó "color", pero el boceto que eligió es todo negro: lo
      // que se midió del dibujo pesa más que lo que se marcó en el formulario.
      const result = computeQuote({
        ...GRANDE,
        colorMode: 'color',
        palette: [{ hex: '#050505', share: 1 }],
      });
      expect(find(result, 'Tinta roja')).toBeUndefined();
      expect(find(result, 'Tinta amarilla')).toBeUndefined();
    });

    test('un diseño en negro no cotiza las tintas de color', () => {
      const result = computeQuote({ ...GRANDE, palette: [{ hex: '#050505', share: 1 }] });
      expect(find(result, 'Tinta negra')).toBeDefined();
      expect(find(result, 'Tinta roja')).toBeUndefined();
      expect(find(result, 'Tinta amarilla')).toBeUndefined();
    });

    test('los cartuchos no se reparten: una aguja no distingue colores', () => {
      const sin = find(computeQuote(GRANDE), 'Cartuchos RL 03').quantity;
      const con = find(computeQuote({ ...GRANDE, palette: PALETA }), 'Cartuchos RL 03').quantity;
      expect(con).toBe(sin);
    });

    describe('el área de tinta se reparte, nunca se multiplica', () => {
      // La invariante que faltaba: con N tintas guardadas se cobraba N veces el
      // área, así que el costo crecía con el tamaño del inventario en vez de
      // con el del tatuaje.
      //
      // Se compara contra el mismo cálculo con una sola tinta, que por
      // definición recibe el área entera: así la medida no depende de los
      // multiplicadores de trazo y color, que afectan a los dos lados por igual.
      // Las tres tintas del inventario de prueba comparten tasa, de modo que
      // sus cantidades son sumables.
      const totalTinta = (result) =>
        ['Tinta negra', 'Tinta roja', 'Tinta amarilla'].reduce(
          (sum, n) => sum + (find(result, n)?.quantity ?? 0),
          0
        );

      test.each(['negro', 'grises', 'color'])(
        'en modo "%s" el reparto no supera lo que gastaría una sola tinta',
        (colorMode) => {
          const conUna = computeQuote({
            ...GRANDE,
            colorMode,
            materials: [CARTUCHOS, NEGRA, GUANTES],
          });
          const conTres = computeQuote({ ...GRANDE, colorMode });
          // La holgura cubre el piso de una unidad por sesión en cada tinta.
          expect(totalTinta(conTres)).toBeLessThanOrEqual(totalTinta(conUna) + 2);
        }
      );

      test('agregar tintas al inventario no encarece un diseño en negro', () => {
        const unaTinta = computeQuote({
          ...GRANDE,
          colorMode: 'negro',
          materials: [CARTUCHOS, NEGRA, GUANTES],
        });
        const muchasTintas = computeQuote({ ...GRANDE, colorMode: 'negro' });
        expect(muchasTintas.materialsCost).toBe(unaTinta.materialsCost);
      });
    });

    test('un insumo de la categoría tintas que se gasta por sesión no se reparte', () => {
      // Las copitas son "tintas" pero se sirven por sesión, no por color.
      // Meterlas en el reparto las sacaba de la cotización entera.
      const copitas = {
        id: 'm-c',
        name: 'Copitas de tinta',
        category: 'tintas',
        unit: 'unidad',
        unit_cost: 40,
        consumption_basis: 'sesion',
        consumption_rate: 4,
      };
      for (const colorMode of ['negro', 'color']) {
        const result = computeQuote({
          ...GRANDE,
          colorMode,
          materials: [...CON_COLOR, copitas],
        });
        expect(find(result, 'Copitas de tinta')?.quantity).toBe(4);
      }
    });

    test('un color sin tinta equivalente se cotiza con la tinta de referencia', () => {
      const result = computeQuote({
        ...GRANDE,
        palette: [{ hex: '#111111', share: 0.5 }, { hex: '#8e44ad', share: 0.5 }],
      });
      expect(result.missingInks).toEqual([
        { hex: '#8e44ad', share: 0.5, suggestion: 'Tinta morada' },
      ]);
      // La mitad morada no se le carga a la tinta negra…
      const soloNegro = computeQuote({ ...GRANDE, palette: [{ hex: '#111111', share: 0.5 }] });
      expect(find(result, 'Tinta negra').quantity).toBe(find(soloNegro, 'Tinta negra').quantity);
      // …sino a una línea propia, sin insumo detrás porque hay que comprarla.
      const morada = find(result, 'Tinta morada (por comprar)');
      expect(morada).toMatchObject({ materialId: null, unit: 'ml', source: 'calculado' });
      expect(morada.subtotal).toBeGreaterThan(0);
      // Y entra en el total: es lo que faltaba cuando un dibujo a color salía
      // cotizado solo con negro.
      expect(result.materialsCost).toBe(soloNegro.materialsCost + morada.subtotal);
    });

    test('varios tonos sin tinta que caen en la misma referencia son una sola línea', () => {
      const result = computeQuote({
        ...GRANDE,
        palette: [
          { hex: '#111111', share: 0.4 },
          { hex: '#8e44ad', share: 0.3 },
          { hex: '#9b59b6', share: 0.3 },
        ],
      });
      expect(result.items.filter((i) => i.name.includes('por comprar'))).toHaveLength(1);
    });

    test('un café de poca saturación no se cotiza como negro', () => {
      // El pelaje de un gato: croma 0,035, que antes pasaba por gris.
      const result = computeQuote({ ...GRANDE, palette: [{ hex: '#4c362d', share: 1 }] });
      expect(find(result, 'Tinta negra')).toBeUndefined();
      expect(find(result, 'Tinta café (por comprar)')).toBeDefined();
    });

    test('sin tintas con color declarado, la paleta no cambia nada', () => {
      const result = computeQuote({ ...MEDIANA, palette: PALETA });
      expect(result.items).toEqual(computeQuote(MEDIANA).items);
      expect(result.missingInks).toEqual([]);
    });

    test('el piso de esterilidad sigue valiendo para cada tinta repartida', () => {
      const result = computeQuote({
        ...GRANDE,
        widthCm: 3,
        heightCm: 2,
        inkRatio: 0.1,
        palette: PALETA,
      });
      expect(find(result, 'Tinta amarilla').quantity).toBe(1);
    });
  });
});
