jest.mock('../src/services/reminders');

const { runReminders } = require('../src/services/reminders');
const { reminders } = require('../src/controllers/jobController');

const req = { get: () => 'la-clave-correcta' };
const makeRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  process.env.CRON_SECRET = 'la-clave-correcta';
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  jest.useRealTimers();
  delete process.env.CRON_SECRET;
  console.error.mockRestore();
});

describe('POST /api/jobs/reminders cuando la corrida tarda', () => {
  test('si termina a tiempo responde con el resumen', async () => {
    runReminders.mockResolvedValue({ checked: 2 });
    const res = makeRes();
    await reminders(req, res);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ checked: 2 });
  });

  test('si pasa de 20 segundos responde 202 «en curso» y el trabajo sigue', async () => {
    let finish;
    runReminders.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const res = makeRes();

    const pending = reminders(req, res);
    await jest.advanceTimersByTimeAsync(19_000);
    expect(res.json).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(2_000);
    await pending;

    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith({ status: 'en_curso' });
    finish({ checked: 1 }); // terminar después no vuelve a responder
    await Promise.resolve();
    expect(res.json).toHaveBeenCalledTimes(1);
  });

  test('si la corrida falla después de responder 202, queda en el registro y no tumba el servidor', async () => {
    let fail;
    runReminders.mockReturnValue(new Promise((_, reject) => { fail = reject; }));
    const res = makeRes();

    const pending = reminders(req, res);
    await jest.advanceTimersByTimeAsync(21_000);
    await pending;
    fail(new Error('base caída'));
    await Promise.resolve();
    await Promise.resolve();

    expect(res.status).toHaveBeenCalledWith(202);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('recordatorios'), 'base caída');
  });

  test('si falla antes del plazo responde error', async () => {
    runReminders.mockRejectedValue(new Error('base caída'));
    const res = makeRes();
    await reminders(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
