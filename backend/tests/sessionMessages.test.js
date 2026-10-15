jest.mock('../src/models/sessionModel');
jest.mock('../src/models/notificationSettingsModel', () => ({
  ...jest.requireActual('../src/models/notificationSettingsModel'),
  get: jest.fn(),
}));
jest.mock('../src/services/clientMessages', () => ({ deliver: jest.fn() }));

const sessionModel = require('../src/models/sessionModel');
const settingsModel = require('../src/models/notificationSettingsModel');
const { deliver } = require('../src/services/clientMessages');
const { decideKind, afterUpdate, sendNow } = require('../src/services/sessionMessages');

const NOW = new Date('2026-10-15T12:00:00Z');
const FUTURE = '2026-10-20T15:00:00Z';
const LATER = '2026-10-21T15:00:00Z';
const PAST = '2026-10-10T15:00:00Z';

const session = (status, startsAt, extra = {}) => ({ id: 's1', status, starts_at: startsAt, updated_at: NOW, ...extra });

describe('decideKind: qué mensaje le toca al cliente', () => {
  test.each([
    ['cancelar una cita que iba a ocurrir', session('agendada', FUTURE), session('cancelada', FUTURE), 'cancelacion'],
    ['cambiar la hora de una cita pendiente', session('agendada', FUTURE), session('agendada', LATER), 'reagendamiento'],
    ['dar la sesión por terminada', session('agendada', PAST), session('completada', PAST), 'cuidados'],
    ['terminar una sesión que estaba como no asistió', session('no_asistio', PAST), session('completada', PAST), 'cuidados'],
  ])('%s', (_, before, after, expected) => {
    expect(decideKind(before, after, NOW)).toBe(expected);
  });

  test.each([
    ['cancelar una cita que ya pasó: no tiene sentido avisar', session('agendada', PAST), session('cancelada', PAST)],
    ['mover una cita que ya pasó', session('agendada', PAST), session('agendada', LATER.replace('21', '12'))],
    ['guardar sin cambios', session('agendada', FUTURE), session('agendada', FUTURE)],
    ['marcar la cita como no asistió', session('agendada', PAST), session('no_asistio', PAST)],
    ['guardar otra vez una sesión ya terminada', session('completada', PAST), session('completada', PAST)],
    ['reactivar una cita cancelada', session('cancelada', FUTURE), session('agendada', FUTURE)],
    ['cancelar una cita ya cancelada', session('cancelada', FUTURE), session('cancelada', FUTURE)],
  ])('no avisa al %s', (_, before, after) => {
    expect(decideKind(before, after, NOW)).toBeNull();
  });

  test('la hora cuenta aunque venga como texto o como fecha', () => {
    expect(decideKind(session('agendada', new Date(FUTURE)), session('agendada', FUTURE), NOW)).toBeNull();
  });
});

describe('afterUpdate', () => {
  const settings = { changeNoticeEnabled: true, aftercareEnabled: true, aftercareNote: 'Cuida la zona.' };
  const context = { client_id: 'c1', client_name: 'Ana', client_phone: '987654321', artist_name: 'Pablo' };

  beforeEach(() => {
    jest.clearAllMocks();
    settingsModel.get.mockResolvedValue(settings);
    sessionModel.findWithClient.mockResolvedValue(context);
    deliver.mockResolvedValue({ status: 'pendiente', channel: 'manual', waLink: 'https://wa.me/x' });
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => console.error.mockRestore());

  test('cancelar: entrega el aviso de cancelación y lo cuenta', async () => {
    const notice = await afterUpdate(
      { userId: 'u1', before: session('agendada', FUTURE), after: session('cancelada', FUTURE) },
      { now: NOW }
    );

    expect(notice).toEqual({ kind: 'cancelacion', channel: 'manual', status: 'pendiente', waLink: 'https://wa.me/x' });
    expect(deliver).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'cancelacion', userId: 'u1', sessionId: 's1', artistName: 'Pablo' }),
      expect.anything()
    );
  });

  test('terminar la sesión usa el texto de cuidados que editó el artista (HU28)', async () => {
    await afterUpdate({ userId: 'u1', before: session('agendada', PAST), after: session('completada', PAST) }, { now: NOW });
    expect(deliver.mock.calls[0][0]).toMatchObject({ kind: 'cuidados', note: 'Cuida la zona.' });
  });

  test('cada aviso se puede apagar por separado', async () => {
    settingsModel.get.mockResolvedValue({ ...settings, changeNoticeEnabled: false });
    expect(await afterUpdate({ userId: 'u1', before: session('agendada', FUTURE), after: session('cancelada', FUTURE) }, { now: NOW })).toBeNull();
    expect(await afterUpdate({ userId: 'u1', before: session('agendada', FUTURE), after: session('agendada', LATER) }, { now: NOW })).toBeNull();
    expect(deliver).not.toHaveBeenCalled();

    // Apagar el de cambios no apaga el de cuidados.
    await afterUpdate({ userId: 'u1', before: session('agendada', PAST), after: session('completada', PAST) }, { now: NOW });
    expect(deliver).toHaveBeenCalledTimes(1);

    settingsModel.get.mockResolvedValue({ ...settings, aftercareEnabled: false });
    deliver.mockClear();
    await afterUpdate({ userId: 'u1', before: session('agendada', PAST), after: session('completada', PAST) }, { now: NOW });
    expect(deliver).not.toHaveBeenCalled();
  });

  test('si no tocaba avisar, ni siquiera consulta la configuración', async () => {
    const notice = await afterUpdate({ userId: 'u1', before: session('agendada', FUTURE), after: session('agendada', FUTURE) }, { now: NOW });
    expect(notice).toBeNull();
    expect(settingsModel.get).not.toHaveBeenCalled();
  });

  test('nunca lanza: la cita ya quedó guardada y no se puede perder por el aviso', async () => {
    deliver.mockRejectedValue(new Error('la base se cayó'));
    const notice = await afterUpdate(
      { userId: 'u1', before: session('agendada', FUTURE), after: session('cancelada', FUTURE) },
      { now: NOW }
    );
    expect(notice).toBeNull();
    expect(console.error).toHaveBeenCalled();
  });

  test('un aviso que ya se había dado no se repite en la respuesta', async () => {
    deliver.mockResolvedValue({ status: 'duplicado', channel: 'ninguno' });
    expect(await afterUpdate({ userId: 'u1', before: session('agendada', FUTURE), after: session('cancelada', FUTURE) }, { now: NOW })).toBeNull();
  });

  test('reagendar con otra hora es otro aviso: la clave lleva la hora nueva', async () => {
    await afterUpdate({ userId: 'u1', before: session('agendada', FUTURE), after: session('agendada', LATER) }, { now: NOW });
    await afterUpdate({ userId: 'u1', before: session('agendada', LATER), after: session('agendada', FUTURE) }, { now: NOW });
    const [a, b] = deliver.mock.calls.map((c) => c[0].dedupeKey);
    expect(a).not.toBe(b);
  });
});

describe('sendNow (botón del artista)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    settingsModel.get.mockResolvedValue({ reminderNote: 'Nota de recordatorio.', aftercareNote: 'Nota de cuidados.' });
    sessionModel.findWithClient.mockResolvedValue({ client_id: 'c1', client_name: 'Ana', client_phone: '987654321', artist_name: 'Pablo', starts_at: FUTURE });
    deliver.mockResolvedValue({ status: 'pendiente', channel: 'manual', waLink: 'https://wa.me/x' });
  });

  test('usa la nota que corresponde a cada tipo', async () => {
    await sendNow({ userId: 'u1', sessionId: 's1', kind: 'recordatorio' });
    await sendNow({ userId: 'u1', sessionId: 's1', kind: 'cuidados' });
    expect(deliver.mock.calls[0][0].note).toBe('Nota de recordatorio.');
    expect(deliver.mock.calls[1][0].note).toBe('Nota de cuidados.');
  });

  test('no llena la campanita y su clave lleva la marca de tiempo (es una orden explícita)', async () => {
    await sendNow({ userId: 'u1', sessionId: 's1', kind: 'recordatorio' });
    const call = deliver.mock.calls[0][0];
    expect(call.silent).toBe(true);
    // A diferencia del recordatorio automático (clave fija por cita y hora), esta
    // lleva `Date.now()`: pedirlo dos veces manda dos mensajes.
    expect(call.dedupeKey).toMatch(/^manual:recordatorio:s1:\d+$/);
  });

  test('una sesión ajena o inexistente devuelve null', async () => {
    sessionModel.findWithClient.mockResolvedValue(null);
    expect(await sendNow({ userId: 'u1', sessionId: 'otra', kind: 'recordatorio' })).toBeNull();
    expect(deliver).not.toHaveBeenCalled();
  });
});
