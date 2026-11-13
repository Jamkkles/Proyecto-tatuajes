/**
 * Programador interno de los recordatorios (HU22).
 *
 * Es un temporizador, así que las pruebas adelantan el reloj en vez de
 * esperar. Lo que importa es que no se empalmen dos corridas, que un fallo no
 * tumbe el proceso y que se pueda apagar.
 */
jest.mock('../src/services/reminders');

const { runReminders } = require('../src/services/reminders');
const scheduler = require('../src/services/scheduler');

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

test('corre cada intervalo configurado', async () => {
  runReminders.mockResolvedValue({ checked: 0, sent: 0 });
  const timer = scheduler.start({ env: { REMINDER_INTERVAL_MINUTES: '10' } });

  expect(runReminders).not.toHaveBeenCalled();

  await jest.advanceTimersByTimeAsync(10 * 60 * 1000);
  expect(runReminders).toHaveBeenCalledTimes(1);

  await jest.advanceTimersByTimeAsync(20 * 60 * 1000);
  expect(runReminders).toHaveBeenCalledTimes(3);

  clearInterval(timer);
});

test('con el intervalo en cero no se programa nada', () => {
  expect(scheduler.start({ env: { REMINDER_INTERVAL_MINUTES: '0' } })).toBeNull();
  expect(scheduler.start({ env: { REMINDER_INTERVAL_MINUTES: 'muchos' } })).toBeNull();
});

test('usa el intervalo por defecto cuando no está configurado', async () => {
  runReminders.mockResolvedValue({ checked: 0 });
  const timer = scheduler.start({ env: {} });

  await jest.advanceTimersByTimeAsync(scheduler.DEFAULT_MINUTES * 60 * 1000);

  expect(runReminders).toHaveBeenCalledTimes(1);
  clearInterval(timer);
});

test('una corrida lenta no se empalma con la siguiente', async () => {
  let resolver;
  runReminders.mockImplementation(() => new Promise((r) => { resolver = r; }));
  const timer = scheduler.start({ env: { REMINDER_INTERVAL_MINUTES: '1' } });

  await jest.advanceTimersByTimeAsync(60 * 1000);
  expect(runReminders).toHaveBeenCalledTimes(1);

  // Pasan dos intervalos más mientras la primera corrida sigue abierta.
  await jest.advanceTimersByTimeAsync(2 * 60 * 1000);
  expect(runReminders).toHaveBeenCalledTimes(1);

  resolver({ checked: 0 });
  await Promise.resolve();
  await jest.advanceTimersByTimeAsync(60 * 1000);
  expect(runReminders).toHaveBeenCalledTimes(2);

  clearInterval(timer);
});

test('registra lo enviado cuando hubo citas que revisar', async () => {
  const log = jest.spyOn(console, 'log').mockImplementation(() => {});
  runReminders.mockResolvedValue({ checked: 3, sent: 2 });
  const timer = scheduler.start({ env: { REMINDER_INTERVAL_MINUTES: '1' } });

  await jest.advanceTimersByTimeAsync(60 * 1000);

  expect(log).toHaveBeenCalledWith('Recordatorios:', expect.stringContaining('"sent":2'));
  log.mockRestore();
  clearInterval(timer);
});

test('un fallo de la corrida se registra y el programador sigue vivo', async () => {
  const error = jest.spyOn(console, 'error').mockImplementation(() => {});
  runReminders.mockRejectedValueOnce(new Error('base caída'));
  runReminders.mockResolvedValue({ checked: 0 });
  const timer = scheduler.start({ env: { REMINDER_INTERVAL_MINUTES: '1' } });

  await jest.advanceTimersByTimeAsync(60 * 1000);
  expect(error).toHaveBeenCalledWith('Falló la corrida de recordatorios:', 'base caída');

  await jest.advanceTimersByTimeAsync(60 * 1000);
  expect(runReminders).toHaveBeenCalledTimes(2);

  error.mockRestore();
  clearInterval(timer);
});
