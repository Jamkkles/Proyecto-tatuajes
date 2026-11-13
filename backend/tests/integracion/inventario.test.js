/**
 * Inventario y cotizaciones contra la base real.
 *
 * Las dos reglas que importan aquí solo existen en SQL: el stock nunca queda
 * negativo porque se resta en la base y no en memoria, y una cotización no se
 * descuenta dos veces porque el sello va condicionado dentro de la misma
 * transacción.
 */
const pool = require('../../src/config/db');
const materialModel = require('../../src/models/materialModel');
const quoteModel = require('../../src/models/quoteModel');
const { DEFAULT_MATERIALS } = require('../../src/data/defaultMaterials');
const { crearArtista, crearCliente, crearProyecto, crearInsumo } = require('./datos');

const AJENO = '00000000-0000-0000-0000-000000000000';

describe('materialModel', () => {
  test('lista primero lo que está en nivel crítico y después por nombre', async () => {
    const artista = await crearArtista();
    await crearInsumo(artista.id, { name: 'Zeta holgada', quantity: 50, minQuantity: 5 });
    await crearInsumo(artista.id, { name: 'Alfa holgada', quantity: 50, minQuantity: 5 });
    await crearInsumo(artista.id, { name: 'Beta agotada', quantity: 2, minQuantity: 5 });

    const lista = await materialModel.listByUser(artista.id);
    expect(lista.map((m) => m.name)).toEqual(['Beta agotada', 'Alfa holgada', 'Zeta holgada']);
  });

  test('el nivel crítico incluye el empate', async () => {
    const artista = await crearArtista();
    await crearInsumo(artista.id, { name: 'Justo en el límite', quantity: 5, minQuantity: 5 });
    await crearInsumo(artista.id, { name: 'Uno más', quantity: 6, minQuantity: 5 });

    const criticos = await materialModel.listByUser(artista.id, { low: true });
    expect(criticos.map((m) => m.name)).toEqual(['Justo en el límite']);
  });

  test('filtra por categoría y busca en nombre y proveedor', async () => {
    const artista = await crearArtista();
    await crearInsumo(artista.id, { name: 'Tinta negra', category: 'tintas', supplier: 'Dinamic' });
    await crearInsumo(artista.id, { name: 'Guantes', category: 'proteccion', supplier: 'Medix' });

    expect((await materialModel.listByUser(artista.id, { category: 'tintas' })).map((m) => m.name)).toEqual(['Tinta negra']);
    expect((await materialModel.listByUser(artista.id, { q: 'medix' })).map((m) => m.name)).toEqual(['Guantes']);
    expect(await materialModel.listByUser(artista.id, { q: 'nada' })).toEqual([]);
  });

  test('el stock se descuenta en la base y nunca queda negativo', async () => {
    const artista = await crearArtista();
    const insumo = await crearInsumo(artista.id, { quantity: 10 });

    expect((await materialModel.adjustStock(insumo.id, artista.id, -4)).quantity).toBe(6);
    expect((await materialModel.adjustStock(insumo.id, artista.id, -100)).quantity).toBe(0);
    expect((await materialModel.adjustStock(insumo.id, artista.id, 3)).quantity).toBe(3);
    expect(await materialModel.adjustStock(insumo.id, AJENO, -1)).toBeNull();
  });

  test('dos descuentos a la vez no se pisan', async () => {
    const artista = await crearArtista();
    const insumo = await crearInsumo(artista.id, { quantity: 100 });

    await Promise.all(
      Array.from({ length: 20 }, () => materialModel.adjustStock(insumo.id, artista.id, -1))
    );

    const { quantity } = await materialModel.findByIdForUser(insumo.id, artista.id);
    expect(quantity).toBe(80);
  });

  test('el kit inicial entra una sola vez, aunque se pida dos veces a la vez', async () => {
    const artista = await crearArtista();

    const [uno, otro] = await Promise.all([
      materialModel.ensureStarterKit(artista.id),
      materialModel.ensureStarterKit(artista.id),
    ]);
    expect(uno + otro).toBe(DEFAULT_MATERIALS.length);

    const lista = await materialModel.listByUser(artista.id);
    expect(lista).toHaveLength(DEFAULT_MATERIALS.length);
  });

  test('a quien ya armó su inventario no se le siembra nada, pero queda marcado', async () => {
    const artista = await crearArtista();
    await crearInsumo(artista.id, { name: 'El mío' });

    expect(await materialModel.ensureStarterKit(artista.id)).toBe(0);
    expect((await materialModel.listByUser(artista.id)).map((m) => m.name)).toEqual(['El mío']);

    const { rows } = await pool.query('SELECT materials_seeded_at FROM users WHERE id = $1', [artista.id]);
    expect(rows[0].materials_seeded_at).not.toBeNull();
  });

  test('cargar los básicos a mano no duplica lo que ya está', async () => {
    const artista = await crearArtista();
    const primero = DEFAULT_MATERIALS[0].name;
    await crearInsumo(artista.id, { name: primero.toUpperCase(), unitCost: 99999 });

    const creados = await materialModel.createDefaults(artista.id);
    expect(creados).toHaveLength(DEFAULT_MATERIALS.length - 1);

    const lista = await materialModel.listByUser(artista.id);
    expect(lista).toHaveLength(DEFAULT_MATERIALS.length);
    // El que ya existía conserva lo que el artista había editado.
    const propio = lista.find((m) => m.name === primero.toUpperCase());
    expect(propio.unit_cost).toBe(99999);
  });

  test('vaciar el inventario solo afecta al dueño', async () => {
    const artista = await crearArtista();
    const otro = await crearArtista();
    await crearInsumo(artista.id);
    await crearInsumo(artista.id, { name: 'Otro insumo' });
    await crearInsumo(otro.id, { name: 'Del vecino' });

    expect(await materialModel.removeAll(artista.id)).toBe(2);
    expect(await materialModel.listByUser(artista.id)).toEqual([]);
    expect(await materialModel.listByUser(otro.id)).toHaveLength(1);
  });

  test('listConsumable deja fuera lo que no se gasta', async () => {
    const artista = await crearArtista();
    await crearInsumo(artista.id, { name: 'Con regla', consumptionBasis: 'area', consumptionRate: 0.05 });
    await crearInsumo(artista.id, { name: 'Sin regla', consumptionBasis: 'ninguno', consumptionRate: 0 });
    await crearInsumo(artista.id, { name: 'Con base pero sin tasa', consumptionBasis: 'sesion', consumptionRate: 0 });

    const gastables = await materialModel.listConsumable(artista.id);
    expect(gastables.map((m) => m.name)).toEqual(['Con regla']);
  });

  test('el insumo de otro artista no se edita ni se borra', async () => {
    const dueno = await crearArtista();
    const intruso = await crearArtista();
    const insumo = await crearInsumo(dueno.id);

    expect(await materialModel.findByIdForUser(insumo.id, intruso.id)).toBeNull();
    expect(await materialModel.update(insumo.id, intruso.id, { name: 'Robado' })).toBeNull();
    expect(await materialModel.remove(insumo.id, intruso.id)).toBeNull();
    expect((await materialModel.findByIdForUser(insumo.id, dueno.id)).name).toBe('Insumo');
  });
});

describe('quoteModel', () => {
  async function cotizacionCon(artista, items, extra = {}) {
    return quoteModel.create({
      userId: artista.id,
      title: 'Cotización',
      widthCm: 10,
      heightCm: 15,
      inkRatio: 0.3,
      stroke: 'medio',
      colorMode: 'negro',
      sessionsCount: 1,
      estimatedMinutes: 90,
      materialsCost: items.reduce((n, i) => n + Math.round(i.quantity * i.unitCost), 0),
      items,
      ...extra,
    });
  }

  const linea = (material, quantity) => ({
    materialId: material.id,
    name: material.name,
    unit: material.unit,
    quantity,
    unitCost: material.unit_cost,
  });

  test('guarda la cotización con su detalle en una sola transacción', async () => {
    const artista = await crearArtista();
    const tinta = await crearInsumo(artista.id, { name: 'Tinta negra', quantity: 50 });
    const aguja = await crearInsumo(artista.id, { name: 'Cartucho', unit: 'unidad', quantity: 20, unitCost: 1200 });

    const cotizacion = await cotizacionCon(artista, [linea(tinta, 2.5), linea(aguja, 3)]);

    expect(cotizacion.items).toHaveLength(2);
    expect(cotizacion.materials_cost).toBe(Math.round(2.5 * 600) + 3 * 1200);
    expect(cotizacion.items.map((i) => i.name)).toEqual(['Tinta negra', 'Cartucho']);
  });

  test('descuenta el stock una vez y la segunda no hace nada', async () => {
    const artista = await crearArtista();
    const tinta = await crearInsumo(artista.id, { name: 'Tinta', quantity: 50 });
    const cotizacion = await cotizacionCon(artista, [linea(tinta, 4)]);

    const resultado = await quoteModel.consume(cotizacion.id, artista.id);
    expect(resultado.affected).toHaveLength(1);
    expect(resultado.affected[0]).toMatchObject({ discounted: 4, quantity: 46, low: false });
    expect(resultado.quote.consumed_at).not.toBeNull();

    expect(await quoteModel.consume(cotizacion.id, artista.id)).toBeNull();
    expect((await materialModel.findByIdForUser(tinta.id, artista.id)).quantity).toBe(46);
  });

  test('dos descuentos simultáneos dejan el stock descontado una sola vez', async () => {
    const artista = await crearArtista();
    const tinta = await crearInsumo(artista.id, { name: 'Tinta', quantity: 30 });
    const cotizacion = await cotizacionCon(artista, [linea(tinta, 10)]);

    const intentos = await Promise.all([
      quoteModel.consume(cotizacion.id, artista.id),
      quoteModel.consume(cotizacion.id, artista.id),
    ]);
    expect(intentos.filter(Boolean)).toHaveLength(1);
    expect((await materialModel.findByIdForUser(tinta.id, artista.id)).quantity).toBe(20);
  });

  test('avisa de los insumos que quedaron en nivel crítico', async () => {
    const artista = await crearArtista();
    const tinta = await crearInsumo(artista.id, { name: 'Tinta', quantity: 12, minQuantity: 10 });
    const cotizacion = await cotizacionCon(artista, [linea(tinta, 5)]);

    const { affected } = await quoteModel.consume(cotizacion.id, artista.id);
    expect(affected[0]).toMatchObject({ quantity: 7, low: true });
  });

  test('las líneas que no llegan a una unidad no tocan el stock', async () => {
    const artista = await crearArtista();
    const film = await crearInsumo(artista.id, { name: 'Film', unit: 'metro', quantity: 10 });
    const cotizacion = await cotizacionCon(artista, [linea(film, 0.3)]);

    const { affected } = await quoteModel.consume(cotizacion.id, artista.id);
    expect(affected).toHaveLength(0);
    expect((await materialModel.findByIdForUser(film.id, artista.id)).quantity).toBe(10);
  });

  test('el stock no queda negativo aunque lo cotizado supere lo que hay', async () => {
    const artista = await crearArtista();
    const tinta = await crearInsumo(artista.id, { name: 'Tinta', quantity: 3 });
    const cotizacion = await cotizacionCon(artista, [linea(tinta, 10)]);

    const { affected } = await quoteModel.consume(cotizacion.id, artista.id);
    expect(affected[0].quantity).toBe(0);
  });

  test('una línea sin insumo vivo entra en el total y no descuenta nada', async () => {
    const artista = await crearArtista();
    const cotizacion = await cotizacionCon(artista, [
      { materialId: null, name: 'Tinta café (por comprar)', unit: 'ml', quantity: 2, unitCost: 700, source: 'manual' },
    ]);

    expect(cotizacion.items[0].material_id).toBeNull();
    expect(cotizacion.materials_cost).toBe(1400);

    const { affected } = await quoteModel.consume(cotizacion.id, artista.id);
    expect(affected).toHaveLength(0);
  });

  test('borrar el insumo deja la línea con su nombre y su costo', async () => {
    const artista = await crearArtista();
    const tinta = await crearInsumo(artista.id, { name: 'Tinta que se va', quantity: 50 });
    const cotizacion = await cotizacionCon(artista, [linea(tinta, 2)]);

    await materialModel.remove(tinta.id, artista.id);

    const guardada = await quoteModel.findByIdForUser(cotizacion.id, artista.id);
    expect(guardada.items[0]).toMatchObject({
      material_id: null,
      name: 'Tinta que se va',
      unit_cost: 600,
    });
  });

  test('editar reemplaza el detalle completo y recalcula el costo', async () => {
    const artista = await crearArtista();
    const tinta = await crearInsumo(artista.id, { name: 'Tinta', quantity: 50 });
    const aguja = await crearInsumo(artista.id, { name: 'Cartucho', unit: 'unidad', unitCost: 1200 });
    const cotizacion = await cotizacionCon(artista, [linea(tinta, 2), linea(aguja, 5)]);

    const editada = await quoteModel.update(
      cotizacion.id,
      artista.id,
      { title: 'Ajustada', materialsCost: 1200 },
      [linea(aguja, 1)]
    );
    expect(editada.title).toBe('Ajustada');
    expect(editada.items).toHaveLength(1);
    expect(editada.items[0].name).toBe('Cartucho');
  });

  test('una cotización ya consumida no se deja editar', async () => {
    const artista = await crearArtista();
    const tinta = await crearInsumo(artista.id, { name: 'Tinta', quantity: 50 });
    const cotizacion = await cotizacionCon(artista, [linea(tinta, 2)]);
    await quoteModel.consume(cotizacion.id, artista.id);

    expect(await quoteModel.update(cotizacion.id, artista.id, { title: 'Tarde' }, null)).toBeNull();
  });

  test('se encuentra por sesión y se lista por proyecto', async () => {
    const artista = await crearArtista();
    const cliente = await crearCliente(artista.id);
    const proyecto = await crearProyecto(artista.id, cliente.id);
    const otroProyecto = await crearProyecto(artista.id, cliente.id, { title: 'Otro' });
    const tinta = await crearInsumo(artista.id, { name: 'Tinta', quantity: 50 });

    const delProyecto = await cotizacionCon(artista, [linea(tinta, 1)], { projectId: proyecto.id });
    await cotizacionCon(artista, [linea(tinta, 1)], { projectId: otroProyecto.id });

    const lista = await quoteModel.listByUser(artista.id, { projectId: proyecto.id });
    expect(lista.map((q) => q.id)).toEqual([delProyecto.id]);
    expect(await quoteModel.listByUser(artista.id)).toHaveLength(2);
  });

  test('la cotización de otro artista no se ve, no se edita, no se consume', async () => {
    const dueno = await crearArtista();
    const intruso = await crearArtista();
    const tinta = await crearInsumo(dueno.id, { name: 'Tinta', quantity: 50 });
    const cotizacion = await quoteModel.create({
      userId: dueno.id,
      title: 'Privada',
      widthCm: 10,
      heightCm: 10,
      inkRatio: 0.2,
      stroke: 'medio',
      colorMode: 'negro',
      sessionsCount: 1,
      estimatedMinutes: 60,
      materialsCost: 600,
      items: [linea(tinta, 1)],
    });

    expect(await quoteModel.findByIdForUser(cotizacion.id, intruso.id)).toBeNull();
    expect(await quoteModel.consume(cotizacion.id, intruso.id)).toBeNull();
    expect(await quoteModel.remove(cotizacion.id, intruso.id)).toBeNull();
    expect((await materialModel.findByIdForUser(tinta.id, dueno.id)).quantity).toBe(50);
  });

  test('borrar la cotización se lleva su detalle', async () => {
    const artista = await crearArtista();
    const tinta = await crearInsumo(artista.id, { name: 'Tinta', quantity: 50 });
    const cotizacion = await cotizacionCon(artista, [linea(tinta, 2)]);

    expect(await quoteModel.remove(cotizacion.id, artista.id)).toMatchObject({ id: cotizacion.id });
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM quote_items');
    expect(rows[0].n).toBe(0);
  });
});
