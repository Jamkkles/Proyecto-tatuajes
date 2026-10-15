const whatsapp = require('../src/services/whatsapp');

const ENV = { WHATSAPP_TOKEN: 'tok-secreto', WHATSAPP_PHONE_NUMBER_ID: '123456' };
const ok = (body) => ({ ok: true, status: 200, json: async () => body });
const fail = (status, body) => ({ ok: false, status, json: async () => body });

describe('configuración', () => {
  test('sin token o sin id del número no está configurado', () => {
    expect(whatsapp.isConfigured({})).toBe(false);
    expect(whatsapp.isConfigured({ WHATSAPP_TOKEN: 'x' })).toBe(false);
    expect(whatsapp.isConfigured({ WHATSAPP_PHONE_NUMBER_ID: '1' })).toBe(false);
    expect(whatsapp.isConfigured({ WHATSAPP_TOKEN: '  ', WHATSAPP_PHONE_NUMBER_ID: '1' })).toBe(false);
  });

  test('con las dos cosas sí, y trae valores por defecto razonables', () => {
    expect(whatsapp.isConfigured(ENV)).toBe(true);
    expect(whatsapp.config(ENV)).toMatchObject({ version: whatsapp.DEFAULT_VERSION, language: 'es' });
  });
});

describe('cleanParam', () => {
  test('deja una sola línea y sin espacios repetidos: Meta rechaza lo contrario', () => {
    expect(whatsapp.cleanParam('Hola\n\nmundo \t  de   prueba')).toBe('Hola mundo de prueba');
  });

  test('nunca queda vacío: Meta rechaza parámetros sin texto', () => {
    expect(whatsapp.cleanParam('')).toBe('-');
    expect(whatsapp.cleanParam('   \n ')).toBe('-');
    expect(whatsapp.cleanParam(null)).toBe('-');
  });

  test('corta lo demasiado largo', () => {
    expect(whatsapp.cleanParam('a'.repeat(2000)).length).toBe(900);
  });
});

describe('sendTemplate', () => {
  const message = { to: '56912345678', template: 'recordatorio_cita', params: ['Ana', 'Pablo', 'viernes 16', '15:30', 'Nota'] };

  test('arma la petición como la pide la Cloud API', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(ok({ messages: [{ id: 'wamid.ABC' }] }));

    const result = await whatsapp.sendTemplate(message, { env: ENV, fetchImpl });

    expect(result).toEqual({ id: 'wamid.ABC' });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(`https://graph.facebook.com/${whatsapp.DEFAULT_VERSION}/123456/messages`);
    expect(init.method).toBe('POST');
    // El token va en la cabecera, nunca en la URL ni en el cuerpo.
    expect(init.headers.Authorization).toBe('Bearer tok-secreto');
    expect(url).not.toContain('tok-secreto');
    expect(init.body).not.toContain('tok-secreto');

    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      messaging_product: 'whatsapp',
      to: '56912345678',
      type: 'template',
      template: { name: 'recordatorio_cita', language: { code: 'es' } },
    });
    expect(body.template.components[0]).toEqual({
      type: 'body',
      parameters: ['Ana', 'Pablo', 'viernes 16', '15:30', 'Nota'].map((text) => ({ type: 'text', text })),
    });
  });

  test('los parámetros se limpian antes de enviarse', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(ok({ messages: [{ id: 'x' }] }));
    await whatsapp.sendTemplate({ ...message, params: ['Ana\nMaría', ''] }, { env: ENV, fetchImpl });
    const params = JSON.parse(fetchImpl.mock.calls[0][1].body).template.components[0].parameters;
    expect(params.map((p) => p.text)).toEqual(['Ana María', '-']);
  });

  test('el mensaje de error de Meta llega tal cual, sin el token', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(fail(404, { error: { message: 'Template name does not exist', code: 132001 } }));

    const error = await whatsapp.sendTemplate(message, { env: ENV, fetchImpl }).catch((e) => e);

    expect(error).toBeInstanceOf(whatsapp.WhatsAppError);
    expect(error.message).toBe('Template name does not exist');
    expect(error.status).toBe(404);
    expect(error.code).toBe(132001);
    expect(error.message).not.toContain('tok-secreto');
  });

  test('si no se pudo ni contactar a WhatsApp, también es un WhatsAppError', async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new Error('getaddrinfo ENOTFOUND'));
    await expect(whatsapp.sendTemplate(message, { env: ENV, fetchImpl })).rejects.toThrow(/No se pudo contactar/);
  });

  test('una respuesta sin id del mensaje se trata como fallo', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(ok({ messages: [] }));
    await expect(whatsapp.sendTemplate(message, { env: ENV, fetchImpl })).rejects.toThrow(/id del mensaje/);
  });

  test('sin configurar ni intenta la llamada', async () => {
    const fetchImpl = jest.fn();
    await expect(whatsapp.sendTemplate(message, { env: {}, fetchImpl })).rejects.toThrow(/no está configurado/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
