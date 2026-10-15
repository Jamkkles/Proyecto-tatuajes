jest.mock('../src/models/messageLogModel');
jest.mock('../src/services/notifier');
jest.mock('../src/services/whatsapp', () => ({
  ...jest.requireActual('../src/services/whatsapp'),
  sendTemplate: jest.fn(),
}));

const messageLogModel = require('../src/models/messageLogModel');
const { notify } = require('../src/services/notifier');
const whatsapp = require('../src/services/whatsapp');
const { deliver, KINDS, KIND_NAMES, firstName } = require('../src/services/clientMessages');

const WA_ENV = { WHATSAPP_TOKEN: 't', WHATSAPP_PHONE_NUMBER_ID: '1' };
const STARTS = new Date('2026-10-16T18:30:00Z'); // viernes 16, 15:30 en Chile

const base = (extra = {}) => ({
  kind: 'recordatorio',
  userId: 'u1',
  sessionId: 's1',
  client: { id: 'c1', name: 'Ana María Pérez', phone: '9 8765 4321' },
  artistName: 'Pablo Correa',
  startsAt: STARTS,
  note: 'Trae ropa cómoda.',
  dedupeKey: 'recordatorio:s1:1',
  ...extra,
});

beforeEach(() => {
  jest.clearAllMocks();
  messageLogModel.claim.mockResolvedValue({ id: 'log1' });
  messageLogModel.finish.mockResolvedValue();
  notify.mockResolvedValue({});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => console.error.mockRestore?.());

describe('los mensajes', () => {
  test('hay uno por cada situación y cada uno trae sus dos formas', () => {
    expect([...KIND_NAMES].sort()).toEqual(['cancelacion', 'cuidados', 'reagendamiento', 'recordatorio']);
    const ctx = { clientName: 'Ana', artistName: 'Pablo', startsAt: STARTS, note: 'Nota' };
    for (const kind of KIND_NAMES) {
      const def = KINDS[kind];
      expect(def.template({})).toMatch(/^[a-z_]+$/);
      expect(def.params(ctx).every((p) => typeof p === 'string' && p.length > 0)).toBe(true);
      expect(def.text(ctx)).toContain('Ana');
    }
  });

  test('el texto y los parámetros de la plantilla dicen lo mismo', () => {
    const ctx = { clientName: 'Ana', artistName: 'Pablo', startsAt: STARTS, note: 'Trae ropa cómoda.' };
    const text = KINDS.recordatorio.text(ctx);
    // Cada parámetro de la plantilla aparece en el texto que ve quien lo envía a mano.
    for (const value of KINDS.recordatorio.params(ctx)) expect(text).toContain(value);
    expect(text).toContain('viernes 16 de octubre a las 15:30');
  });

  test('el nombre de las plantillas se puede cambiar por variable de entorno', () => {
    expect(KINDS.recordatorio.template({ WHATSAPP_TEMPLATE_RECORDATORIO: 'mi_plantilla' })).toBe('mi_plantilla');
    expect(KINDS.cancelacion.template({})).toBe('cita_cancelada');
  });

  test('«Hola Ana», no «Hola Ana María Pérez Soto»', () => {
    expect(firstName('Ana María Pérez Soto')).toBe('Ana');
    expect(firstName('  ')).toBe('cliente');
    expect(firstName(null)).toBe('cliente');
  });
});

describe('deliver sin API de WhatsApp (el camino gratis)', () => {
  test('deja el aviso al artista con el enlace de WhatsApp ya escrito', async () => {
    const result = await deliver(base(), { env: {} });

    expect(whatsapp.sendTemplate).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: 'pendiente', channel: 'manual' });
    expect(result.waLink).toMatch(/^https:\/\/wa\.me\/56987654321\?text=/);
    expect(decodeURIComponent(result.waLink.split('text=')[1])).toContain('Hola Ana, te recordamos');

    expect(messageLogModel.finish).toHaveBeenCalledWith('log1', expect.objectContaining({ status: 'pendiente', channel: 'manual' }));
    // Con push: es lo que el artista tiene que hacer.
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][1]).toMatchObject({
      kind: 'mensaje_manual',
      title: 'Recuerda a Ana su cita',
      data: expect.objectContaining({ waLink: result.waLink }),
    });
    expect(notify.mock.calls[0][2]).toBeUndefined();
  });

  test('cada tipo deja su propio aviso', async () => {
    for (const kind of KIND_NAMES) {
      notify.mockClear();
      await deliver(base({ kind, dedupeKey: `${kind}:s1` }), { env: {} });
      expect(notify.mock.calls[0][1].title).toBe(KINDS[kind].title({ clientName: 'Ana' }));
    }
  });
});

describe('deliver con API de WhatsApp', () => {
  test('lo envía por la API, lo registra y avisa sin interrumpir', async () => {
    whatsapp.sendTemplate.mockResolvedValue({ id: 'wamid.1' });

    const result = await deliver(base(), { env: WA_ENV });

    expect(result).toMatchObject({ status: 'enviado', channel: 'whatsapp' });
    expect(whatsapp.sendTemplate).toHaveBeenCalledWith(
      {
        to: '56987654321',
        template: 'recordatorio_cita',
        params: ['Ana', 'Pablo', 'viernes 16 de octubre', '15:30', 'Trae ropa cómoda.'],
      },
      { env: WA_ENV }
    );
    expect(messageLogModel.finish).toHaveBeenCalledWith('log1', { status: 'enviado', channel: 'whatsapp', providerId: 'wamid.1' });
    // Informativo: queda en la campanita, pero no vibra el teléfono.
    expect(notify.mock.calls[0][1].kind).toBe('mensaje_enviado');
    expect(notify.mock.calls[0][2]).toEqual({ push: false });
  });

  test('si la API falla, cae al camino manual y deja constancia del error', async () => {
    whatsapp.sendTemplate.mockRejectedValue(new Error('Template name does not exist'));

    const result = await deliver(base(), { env: WA_ENV });

    expect(result).toMatchObject({ status: 'error', channel: 'manual', error: 'Template name does not exist' });
    expect(result.waLink).toBeTruthy();
    expect(messageLogModel.finish).toHaveBeenCalledWith('log1', expect.objectContaining({ status: 'error', channel: 'manual' }));
    // El cliente no se queda sin aviso: al artista le llega para enviarlo a mano.
    expect(notify.mock.calls[0][1].kind).toBe('mensaje_manual');
  });
});

describe('casos límite', () => {
  test('sin teléfono válido no hay a quién escribirle: se registra y se avisa que lo corrija', async () => {
    const result = await deliver(base({ client: { id: 'c1', name: 'Luis', phone: '1234' } }), { env: WA_ENV });

    expect(result).toMatchObject({ status: 'omitido', reason: 'sin_telefono' });
    expect(whatsapp.sendTemplate).not.toHaveBeenCalled();
    expect(notify.mock.calls[0][1]).toMatchObject({ kind: 'mensaje_omitido', url: '/clientes/c1' });
    expect(messageLogModel.finish).toHaveBeenCalledWith('log1', expect.objectContaining({ status: 'omitido' }));
  });

  test('un cliente sin teléfono tampoco manda a la API aunque esté configurada', async () => {
    await deliver(base({ client: { id: 'c1', name: 'Luis', phone: null } }), { env: WA_ENV });
    expect(whatsapp.sendTemplate).not.toHaveBeenCalled();
  });

  test('si ya estaba reclamado (otra corrida lo mandó) no hace nada', async () => {
    messageLogModel.claim.mockResolvedValue(null);

    const result = await deliver(base(), { env: WA_ENV });

    expect(result.status).toBe('duplicado');
    expect(whatsapp.sendTemplate).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
    expect(messageLogModel.finish).not.toHaveBeenCalled();
  });

  test('se reclama ANTES de enviar: si el proceso muere a medias no se manda dos veces', async () => {
    const orden = [];
    messageLogModel.claim.mockImplementation(async () => { orden.push('reclamo'); return { id: 'log1' }; });
    whatsapp.sendTemplate.mockImplementation(async () => { orden.push('envío'); return { id: 'x' }; });

    await deliver(base(), { env: WA_ENV });

    expect(orden).toEqual(['reclamo', 'envío']);
  });

  test('«silent» (lo pidió el artista desde la pantalla) no llena la campanita', async () => {
    const result = await deliver(base({ silent: true }), { env: {} });
    expect(result.waLink).toBeTruthy();
    expect(notify).not.toHaveBeenCalled();
  });

  test('un tipo de mensaje que no existe es un error de programación, no un fallo silencioso', async () => {
    await expect(deliver(base({ kind: 'inventado' }), { env: {} })).rejects.toThrow(/desconocido/);
  });
});
