// La regla de «una hora ocupada no se vuelve a agendar», con una base simulada. Se prueba
// QUÉ consultas hace el modelo y cuándo; que el SQL en sí acierta (contiguas, cancelada,
// envolventes, concurrencia) se comprobó contra Postgres real.
jest.mock('../src/config/db', () => ({ connect: jest.fn(), query: jest.fn() }));

const pool = require('../src/config/db');
const sessionModel = require('../src/models/sessionModel');
const { ConflictError } = require('../src/utils/fields');

const USER = 'u1';
const ID = 's1';
const isOverlapQuery = (sql) => sql.includes('make_interval');

let log;
let overlapRow;
let currentRow;

beforeEach(() => {
  jest.clearAllMocks();
  log = [];
  overlapRow = null; // sin cita que choque
  currentRow = { starts_at: '2026-10-16T15:00:00.000Z', duration_minutes: 120, status: 'agendada' };
  const client = {
    release: jest.fn(),
    query: jest.fn(async (sql) => {
      const text = String(sql).trim();
      log.push(text.split(/\s+/)[0] === 'SELECT' && text.includes('advisory') ? 'LOCK' : isOverlapQuery(text) ? 'OVERLAP' : text.split(/\s+/)[0]);
      if (isOverlapQuery(text)) return { rows: overlapRow ? [overlapRow] : [] };
      if (text.startsWith('SELECT starts_at')) return { rows: currentRow ? [currentRow] : [] };
      if (text.startsWith('INSERT') || text.startsWith('UPDATE')) return { rows: [{ id: ID }] };
      return { rows: [] };
    }),
  };
  pool.connect.mockResolvedValue(client);
  pool.query.mockResolvedValue({ rows: [{ id: ID }] });
});

const clash = { starts_at: '2026-10-16T18:00:00.000Z', duration_minutes: 120, client_name: 'Ana' }; // 15:00–17:00 en Chile (UTC-3)

describe('agendar (create)', () => {
  test('toma el candado del artista antes de revisar y guardar, todo en una transacción', async () => {
    await sessionModel.create({ userId: USER, projectId: 'p1', startsAt: '2026-10-16T20:00:00.000Z', durationMinutes: 60 });
    expect(log).toEqual(['BEGIN', 'LOCK', 'OVERLAP', 'INSERT', 'COMMIT']);
  });

  test('si la hora está ocupada lanza ConflictError, nombra a la otra cita y no guarda nada', async () => {
    overlapRow = clash;
    const err = await sessionModel
      .create({ userId: USER, projectId: 'p1', startsAt: '2026-10-16T18:30:00.000Z', durationMinutes: 60 })
      .catch((e) => e);

    expect(err).toBeInstanceOf(ConflictError);
    expect(err.status).toBe(409);
    expect(err.message).toMatch(/cita de Ana/);
    expect(err.message).toMatch(/de 15:00 a 17:00/); // en hora de Chile, no en UTC
    expect(log).toEqual(['BEGIN', 'LOCK', 'OVERLAP', 'ROLLBACK']);
  });

  test('una cita que nace cancelada o «no asistió» no ocupa hora: no se revisa', async () => {
    overlapRow = clash;
    await sessionModel.create({ userId: USER, projectId: 'p1', startsAt: '2026-10-16T18:30:00.000Z', status: 'cancelada' });
    expect(log).not.toContain('OVERLAP');
    expect(log).toContain('INSERT');
  });

  test('la duración por defecto (2 horas) cuenta para la revisión', async () => {
    await sessionModel.create({ userId: USER, projectId: 'p1', startsAt: '2026-10-16T20:00:00.000Z' });
    const overlapCall = pool.connect.mock.results[0].value.then((c) => c.query.mock.calls.find((c2) => isOverlapQuery(c2[0])));
    expect((await overlapCall)[1]).toEqual([USER, '2026-10-16T20:00:00.000Z', 120, null]);
  });
});

describe('editar (update)', () => {
  test('cambiar solo el monto o las notas no revisa el horario', async () => {
    overlapRow = clash; // aunque hubiera un choque heredado, no debe bloquear
    await sessionModel.update(ID, USER, { price: 5000, notes: 'x' });
    expect(log).not.toContain('OVERLAP');
    expect(log).toContain('UPDATE');
  });

  test('pagar o despagar tampoco revisa el horario', async () => {
    overlapRow = clash;
    await sessionModel.update(ID, USER, { paid: true });
    expect(log).not.toContain('OVERLAP');
  });

  test('mover la hora sí lo revisa, ignorando la propia cita', async () => {
    await sessionModel.update(ID, USER, { startsAt: '2026-10-16T21:00:00.000Z' });
    expect(log).toEqual(['BEGIN', 'LOCK', 'SELECT', 'OVERLAP', 'UPDATE', 'COMMIT']);
    const calls = (await pool.connect.mock.results[0].value).query.mock.calls;
    expect(calls.find((c) => isOverlapQuery(c[0]))[1]).toEqual([USER, '2026-10-16T21:00:00.000Z', 120, ID]);
  });

  test('alargar la duración también', async () => {
    await sessionModel.update(ID, USER, { durationMinutes: 300 });
    expect(log).toContain('OVERLAP');
  });

  test('volver a escribir la misma hora no cuenta como mover', async () => {
    await sessionModel.update(ID, USER, { startsAt: '2026-10-16T15:00:00.000Z', price: 1 });
    expect(log).not.toContain('OVERLAP');
  });

  test('si la nueva hora choca: ConflictError y la cita queda como estaba', async () => {
    overlapRow = clash;
    const err = await sessionModel.update(ID, USER, { startsAt: '2026-10-16T18:30:00.000Z' }).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect(log).not.toContain('UPDATE');
    expect(log[log.length - 1]).toBe('ROLLBACK');
  });

  test('reactivar una cancelada vuelve a ocupar su hora, así que se revisa', async () => {
    currentRow = { ...currentRow, status: 'cancelada' };
    overlapRow = clash;
    await expect(sessionModel.update(ID, USER, { status: 'agendada' })).rejects.toBeInstanceOf(ConflictError);
  });

  test('cancelar una cita no revisa nada: libera la hora', async () => {
    overlapRow = clash;
    await sessionModel.update(ID, USER, { status: 'cancelada' });
    expect(log).not.toContain('OVERLAP');
  });

  test('una cita ajena (o inexistente) devuelve null sin tocar nada', async () => {
    currentRow = null;
    expect(await sessionModel.update(ID, USER, { price: 1 })).toBeNull();
    expect(log).not.toContain('UPDATE');
  });
});
