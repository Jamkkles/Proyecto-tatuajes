const { sendPasswordReset, parseAddress } = require('../src/services/emailService');

const RESET = 'https://tattoo-estudio.pages.dev/nueva-contrasena?token=abc';
const okResponse = { ok: true, status: 201, json: async () => ({ messageId: '<m1@brevo>' }) };

describe('parseAddress', () => {
  test.each([
    ['"Tattoo Estudio" <hola@x.cl>', { name: 'Tattoo Estudio', email: 'hola@x.cl' }],
    ['Tattoo Estudio <hola@x.cl>', { name: 'Tattoo Estudio', email: 'hola@x.cl' }],
    ['hola@x.cl', { name: 'App', email: 'hola@x.cl' }],
    ['<hola@x.cl>', { name: 'App', email: 'hola@x.cl' }],
  ])('%s', (raw, expected) => {
    expect(parseAddress(raw, 'App')).toEqual(expected);
  });
});

describe('con BREVO_API_KEY el correo sale por la API de Brevo (HTTPS), no por SMTP', () => {
  const env = { BREVO_API_KEY: 'xkeysib-prueba', EMAIL_FROM: 'Tattoo Estudio <pablo@gmail.com>' };

  test('arma la petición con remitente, destinatario, asunto y el enlace', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(okResponse);

    await sendPasswordReset({ to: 'ana@x.cl', resetUrl: RESET }, { env, fetchImpl });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(init.method).toBe('POST');
    expect(init.headers['api-key']).toBe('xkeysib-prueba');
    const body = JSON.parse(init.body);
    expect(body.sender).toEqual({ name: 'Tattoo Estudio', email: 'pablo@gmail.com' });
    expect(body.to).toEqual([{ email: 'ana@x.cl' }]);
    expect(body.subject).toMatch(/Recupera tu contraseña/);
    expect(body.htmlContent).toContain(RESET);
    expect(body.textContent).toContain(RESET);
  });

  test('sin EMAIL_FROM usa SMTP_FROM', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(okResponse);
    await sendPasswordReset(
      { to: 'ana@x.cl', resetUrl: RESET },
      { env: { BREVO_API_KEY: 'k', SMTP_FROM: '"Otro" <otro@x.cl>' }, fetchImpl }
    );
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).sender).toEqual({ name: 'Otro', email: 'otro@x.cl' });
  });

  test('si Brevo rechaza (remitente sin verificar, clave mala…), el error dice por qué', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ code: 'invalid_parameter', message: 'Sender is not valid' }),
    });
    await expect(sendPasswordReset({ to: 'ana@x.cl', resetUrl: RESET }, { env, fetchImpl })).rejects.toThrow(
      'Brevo respondió 400: Sender is not valid'
    );
  });
});
