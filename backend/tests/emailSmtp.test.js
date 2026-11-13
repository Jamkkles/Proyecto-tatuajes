/**
 * El camino SMTP del envío de correo, que es el que se usa en local.
 *
 * En la nube el correo sale por la API de Brevo (lo cubre emailService.test.js)
 * porque el plan gratuito de Render bloquea los puertos de correo; aquí se
 * verifica el otro camino: con `SMTP_HOST` configurado y, sin él, el buzón de
 * pruebas de Ethereal.
 */
jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
  createTestAccount: jest.fn(),
  getTestMessageUrl: jest.fn(),
}));

// Se vuelve a pedir en cada prueba: jest.resetModules() crea un registro nuevo,
// y el doble que ve el servicio es el de ese registro, no el de antes.
let nodemailer;

const RESET = 'http://localhost:5173/nueva-contrasena?token=abc';

let enviados;

function transporteFalso() {
  return {
    verify: jest.fn().mockResolvedValue(true),
    sendMail: jest.fn(async (mensaje) => {
      enviados.push(mensaje);
      return { messageId: '<m1@local>' };
    }),
  };
}

beforeEach(() => {
  jest.resetModules();
  nodemailer = require('nodemailer');
  jest.clearAllMocks();
  enviados = [];
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_PORT;
});

test('con SMTP_HOST configurado verifica la conexión y manda por ahí', async () => {
  const log = jest.spyOn(console, 'log').mockImplementation(() => {});
  const transporte = transporteFalso();
  nodemailer.createTransport.mockReturnValue(transporte);
  process.env.SMTP_HOST = 'smtp.gmail.com';
  process.env.SMTP_PORT = '465';

  const { sendPasswordReset } = require('../src/services/emailService');
  await sendPasswordReset(
    { to: 'ana@correo.cl', resetUrl: RESET },
    { env: { EMAIL_FROM: 'Tattoo Estudio <hola@estudio.cl>' } }
  );

  const opciones = nodemailer.createTransport.mock.calls[0][0];
  expect(opciones.host).toBe('smtp.gmail.com');
  expect(opciones.port).toBe(465);
  // El puerto 465 es el que habla TLS desde el saludo.
  expect(opciones.secure).toBe(true);
  expect(transporte.verify).toHaveBeenCalled();

  expect(enviados).toHaveLength(1);
  expect(enviados[0].to).toBe('ana@correo.cl');
  expect(enviados[0].from).toBe('Tattoo Estudio <hola@estudio.cl>');
  expect(enviados[0].html).toContain(RESET);
  expect(enviados[0].text).toContain(RESET);
  log.mockRestore();
});

test('el transporte se crea una sola vez aunque se manden varios correos', async () => {
  const log = jest.spyOn(console, 'log').mockImplementation(() => {});
  nodemailer.createTransport.mockReturnValue(transporteFalso());
  process.env.SMTP_HOST = 'smtp.gmail.com';

  const { sendPasswordReset } = require('../src/services/emailService');
  await sendPasswordReset({ to: 'ana@correo.cl', resetUrl: RESET }, { env: {} });
  await sendPasswordReset({ to: 'beto@correo.cl', resetUrl: RESET }, { env: {} });

  expect(nodemailer.createTransport).toHaveBeenCalledTimes(1);
  expect(enviados).toHaveLength(2);
  log.mockRestore();
});

test('sin SMTP configurado usa el buzón de pruebas y muestra el enlace de vista previa', async () => {
  const log = jest.spyOn(console, 'log').mockImplementation(() => {});
  nodemailer.createTestAccount.mockResolvedValue({ user: 'prueba@ethereal.email', pass: 'clave' });
  nodemailer.createTransport.mockReturnValue(transporteFalso());
  nodemailer.getTestMessageUrl.mockReturnValue('https://ethereal.email/message/abc');

  const { sendPasswordReset } = require('../src/services/emailService');
  await sendPasswordReset({ to: 'ana@correo.cl', resetUrl: RESET }, { env: {} });

  expect(nodemailer.createTestAccount).toHaveBeenCalled();
  expect(nodemailer.createTransport).toHaveBeenCalledWith(
    expect.objectContaining({ host: 'smtp.ethereal.email' })
  );
  expect(log).toHaveBeenCalledWith('📧 Vista previa Ethereal:', 'https://ethereal.email/message/abc');
  log.mockRestore();
});

test('sin remitente configurado usa uno por defecto con el nombre de la aplicación', async () => {
  const log = jest.spyOn(console, 'log').mockImplementation(() => {});
  nodemailer.createTestAccount.mockResolvedValue({ user: 'u', pass: 'p' });
  nodemailer.createTransport.mockReturnValue(transporteFalso());
  nodemailer.getTestMessageUrl.mockReturnValue(null);

  const { sendPasswordReset } = require('../src/services/emailService');
  await sendPasswordReset({ to: 'ana@correo.cl', resetUrl: RESET }, { env: { APP_NAME: 'Estudio H' } });

  expect(enviados[0].from).toBe('"Estudio H" <noreply@tattoo.app>');
  expect(enviados[0].subject).toContain('Estudio H');
  log.mockRestore();
});
