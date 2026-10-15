jest.mock('../src/models/notificationModel');
jest.mock('../src/services/pushService');

const notificationModel = require('../src/models/notificationModel');
const pushService = require('../src/services/pushService');
const { notify } = require('../src/services/notifier');
const { notifyLowStock } = require('../src/services/stockAlerts');

const row = { id: 'n1', kind: 'stock_bajo', title: 'T', body: 'B', url: '/inventario' };

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  notificationModel.create.mockResolvedValue(row);
  pushService.sendToUser.mockResolvedValue({ sent: 1, removed: 0 });
});
afterEach(() => console.error.mockRestore());

describe('notify', () => {
  test('deja el aviso en la campanita y lo manda por push', async () => {
    const result = await notify('u1', { kind: 'stock_bajo', title: 'T', body: 'B', url: '/inventario' });

    expect(result).toBe(row);
    expect(notificationModel.create).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1', kind: 'stock_bajo' }));
    expect(pushService.sendToUser).toHaveBeenCalledWith('u1', {
      id: 'n1',
      title: 'T',
      body: 'B',
      url: '/inventario',
      tag: 'stock_bajo',
    });
  });

  test('un aviso repetido (clave ya usada) no vuelve a molestar: ni campanita ni push', async () => {
    notificationModel.create.mockResolvedValue(null);
    expect(await notify('u1', { kind: 'stock_bajo', title: 'T', dedupeKey: 'k' })).toBeNull();
    expect(pushService.sendToUser).not.toHaveBeenCalled();
  });

  test('«push: false» es solo campanita', async () => {
    await notify('u1', { kind: 'mensaje_enviado', title: 'T' }, { push: false });
    expect(notificationModel.create).toHaveBeenCalled();
    expect(pushService.sendToUser).not.toHaveBeenCalled();
  });

  test('sin URL el push lleva al panel', async () => {
    notificationModel.create.mockResolvedValue({ ...row, url: null });
    await notify('u1', { kind: 'x', title: 'T' });
    expect(pushService.sendToUser.mock.calls[0][1].url).toBe('/dashboard');
  });

  test('nunca lanza: un fallo de la base o del push no rompe la acción que lo originó', async () => {
    notificationModel.create.mockRejectedValueOnce(new Error('base caída'));
    await expect(notify('u1', { kind: 'x', title: 'T' })).resolves.toBeNull();

    pushService.sendToUser.mockRejectedValueOnce(new Error('push caído'));
    await expect(notify('u1', { kind: 'x', title: 'T' })).resolves.toBe(row);
    expect(console.error).toHaveBeenCalledTimes(2);
  });
});

describe('notifyLowStock (HU13, HU25)', () => {
  const NOW = new Date('2026-10-15T15:00:00Z');
  const material = (over) => ({ id: 'm1', name: 'Guantes de nitrilo', unit: 'par', quantity: 15, min_quantity: 20, ...over });

  test('avisa de lo que llegó al nivel crítico, con lo que queda', async () => {
    await notifyLowStock('u1', [material()], NOW);

    expect(notificationModel.create).toHaveBeenCalledTimes(1);
    expect(notificationModel.create.mock.calls[0][0]).toMatchObject({
      userId: 'u1',
      kind: 'stock_bajo',
      title: 'Guantes de nitrilo llegó a su nivel crítico',
      body: 'Quedan 15 par (mínimo 20). Es hora de reponer.',
      url: '/inventario',
    });
  });

  test('«en el mínimo» ya es crítico, igual que en el inventario', async () => {
    await notifyLowStock('u1', [material({ quantity: 20 })], NOW);
    expect(notificationModel.create).toHaveBeenCalledTimes(1);
  });

  test('lo que tiene de sobra no avisa', async () => {
    await notifyLowStock('u1', [material({ quantity: 21 }), material({ id: 'm2', quantity: 100 })], NOW);
    expect(notificationModel.create).not.toHaveBeenCalled();
  });

  test('como mucho un aviso por insumo y por día (la clave lleva el día de Chile)', async () => {
    await notifyLowStock('u1', [material()], NOW);
    await notifyLowStock('u1', [material()], new Date('2026-10-15T20:00:00Z'));
    await notifyLowStock('u1', [material()], new Date('2026-10-16T15:00:00Z'));
    const keys = notificationModel.create.mock.calls.map((c) => c[0].dedupeKey);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[0]);
    expect(keys[0]).toBe('stock:m1:2026-10-15');
  });

  test('la medianoche se corta en hora de Chile, no en UTC', async () => {
    // 02:00 UTC del 16 es todavía el 15 a las 23:00 en Chile.
    await notifyLowStock('u1', [material()], new Date('2026-10-16T02:00:00Z'));
    expect(notificationModel.create.mock.calls[0][0].dedupeKey).toBe('stock:m1:2026-10-15');
  });
});
