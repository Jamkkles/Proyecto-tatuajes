jest.mock('../src/models/reminderModel');
jest.mock('../src/services/clientMessages', () => ({ deliver: jest.fn() }));

const reminderModel = require('../src/models/reminderModel');
const { deliver } = require('../src/services/clientMessages');
const { runReminders } = require('../src/services/reminders');
const { epochSeconds } = require('../src/utils/chileTime');

const NOW = new Date('2026-10-15T12:00:00Z');
const due = (n, extra = {}) => ({
  id: `s${n}`,
  user_id: 'u1',
  starts_at: new Date('2026-10-16T15:00:00Z'),
  client_id: `c${n}`,
  client_name: `Cliente ${n}`,
  client_phone: '987654321',
  artist_name: 'Pablo',
  reminder_note: 'Nota del artista.',
  ...extra,
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => console.error.mockRestore());

describe('runReminders (HU22)', () => {
  test('sin citas pendientes no hace nada', async () => {
    reminderModel.dueForReminder.mockResolvedValue([]);
    expect(await runReminders({ now: NOW })).toEqual({ checked: 0, whatsapp: 0, manual: 0, omitted: 0, duplicates: 0, errors: 0 });
    expect(deliver).not.toHaveBeenCalled();
  });

  test('pregunta por las citas a la hora que se le dice', async () => {
    reminderModel.dueForReminder.mockResolvedValue([]);
    await runReminders({ now: NOW });
    expect(reminderModel.dueForReminder).toHaveBeenCalledWith(NOW);
  });

  test('cada cita lleva su cliente, su nota y una clave única por cita y hora', async () => {
    reminderModel.dueForReminder.mockResolvedValue([due(1)]);
    deliver.mockResolvedValue({ status: 'pendiente', channel: 'manual' });

    await runReminders({ now: NOW });

    expect(deliver.mock.calls[0][0]).toEqual({
      kind: 'recordatorio',
      userId: 'u1',
      sessionId: 's1',
      client: { id: 'c1', name: 'Cliente 1', phone: '987654321' },
      artistName: 'Pablo',
      startsAt: new Date('2026-10-16T15:00:00Z'),
      note: 'Nota del artista.',
      // Misma forma que arma la consulta SQL (`dueForReminder`): si una cambia y la
      // otra no, el filtro deja de ver lo ya enviado y se repetirían los mensajes.
      dedupeKey: `recordatorio:s1:${epochSeconds('2026-10-16T15:00:00Z')}`,
    });
  });

  test('cuenta cada resultado por su lado', async () => {
    reminderModel.dueForReminder.mockResolvedValue([due(1), due(2), due(3), due(4), due(5)]);
    deliver
      .mockResolvedValueOnce({ status: 'enviado', channel: 'whatsapp' })
      .mockResolvedValueOnce({ status: 'pendiente', channel: 'manual' })
      .mockResolvedValueOnce({ status: 'omitido', channel: 'manual' })
      .mockResolvedValueOnce({ status: 'duplicado', channel: 'ninguno' })
      .mockResolvedValueOnce({ status: 'error', channel: 'manual' });

    expect(await runReminders({ now: NOW })).toEqual({ checked: 5, whatsapp: 1, manual: 2, omitted: 1, duplicates: 1, errors: 0 });
  });

  test('si una falla, las demás siguen', async () => {
    reminderModel.dueForReminder.mockResolvedValue([due(1), due(2), due(3)]);
    deliver
      .mockResolvedValueOnce({ status: 'pendiente', channel: 'manual' })
      .mockRejectedValueOnce(new Error('se cayó la base'))
      .mockResolvedValueOnce({ status: 'pendiente', channel: 'manual' });

    const summary = await runReminders({ now: NOW });

    expect(deliver).toHaveBeenCalledTimes(3);
    expect(summary).toMatchObject({ checked: 3, manual: 2, errors: 1 });
    expect(console.error).toHaveBeenCalled();
  });

  test('se envían de a uno, no todos a la vez (la API de WhatsApp limita el ritmo)', async () => {
    reminderModel.dueForReminder.mockResolvedValue([due(1), due(2), due(3)]);
    let simultaneous = 0;
    let peak = 0;
    deliver.mockImplementation(async () => {
      simultaneous += 1;
      peak = Math.max(peak, simultaneous);
      await new Promise((r) => setTimeout(r, 5));
      simultaneous -= 1;
      return { status: 'pendiente', channel: 'manual' };
    });

    await runReminders({ now: NOW });
    expect(peak).toBe(1);
  });
});

describe('el resumen cuenta lo que salió solo', () => {
  test('tanto por la API oficial como por el WhatsApp vinculado; lo manual aparte', async () => {
    reminderModel.dueForReminder.mockResolvedValue([due(1), due(2), due(3)]);
    deliver
      .mockResolvedValueOnce({ status: 'enviado', channel: 'whatsapp' })
      .mockResolvedValueOnce({ status: 'enviado', channel: 'whatsapp_web' })
      .mockResolvedValueOnce({ status: 'pendiente', channel: 'manual' });

    expect(await runReminders({ now: NOW })).toMatchObject({ checked: 3, whatsapp: 2, manual: 1 });
  });
});

describe('una sola corrida a la vez', () => {
  test('si llega otra mientras una sigue en curso, se une a ella en vez de empezar otra', async () => {
    reminderModel.dueForReminder.mockResolvedValue([due(1)]);
    let release;
    deliver.mockImplementation(() => new Promise((resolve) => { release = () => resolve({ status: 'pendiente', channel: 'manual' }); }));

    const first = runReminders({ now: NOW });
    const second = runReminders({ now: NOW });
    await new Promise((r) => setImmediate(r));
    release();
    const [a, b] = await Promise.all([first, second]);

    expect(reminderModel.dueForReminder).toHaveBeenCalledTimes(1);
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(b).toBe(a);
  });

  test('al terminar, la siguiente corrida vuelve a consultar', async () => {
    reminderModel.dueForReminder.mockResolvedValue([]);
    await runReminders({ now: NOW });
    await runReminders({ now: NOW });
    expect(reminderModel.dueForReminder).toHaveBeenCalledTimes(2);
  });

  test('si una corrida falla, no deja la puerta cerrada para las siguientes', async () => {
    reminderModel.dueForReminder.mockRejectedValueOnce(new Error('base caída'));
    await expect(runReminders({ now: NOW })).rejects.toThrow('base caída');

    reminderModel.dueForReminder.mockResolvedValue([]);
    await expect(runReminders({ now: NOW })).resolves.toMatchObject({ checked: 0 });
  });
});

