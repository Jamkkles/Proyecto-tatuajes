const nodemailer = require('nodemailer');

/*
 * Envío de correos (por ahora, la recuperación de contraseña, HU03). Dos caminos:
 *
 * - **API de Brevo** (si hay `BREVO_API_KEY`): va por HTTPS. Es el que sirve en la nube,
 *   porque el plan gratuito de Render bloquea los puertos de correo (25, 465 y 587) desde
 *   septiembre de 2025, así que el SMTP de Gmail allá nunca conecta.
 * - **SMTP** (si hay `SMTP_HOST`, p. ej. Gmail en local) o, sin nada, Ethereal: un buzón de
 *   pruebas cuyos correos no le llegan a nadie (la URL de vista previa sale en la consola).
 *
 * El remitente sale de `EMAIL_FROM` (o `SMTP_FROM`): «Tattoo Estudio <tu@gmail.com>». Con
 * Brevo, ese correo tiene que estar verificado como remitente en la cuenta de Brevo.
 */

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';
const BREVO_TIMEOUT_MS = 15_000;

/** «"Tattoo Estudio" <hola@x.cl>», «Tattoo Estudio <hola@x.cl>» o «hola@x.cl» → { name, email }. */
function parseAddress(raw, fallbackName) {
  const text = String(raw ?? '').trim();
  const match = /^"?([^"<]*?)"?\s*<([^>]+)>$/.exec(text);
  if (match) return { name: match[1].trim() || fallbackName, email: match[2].trim() };
  return { name: fallbackName, email: text };
}

/** Manda el correo por la API de Brevo. Lanza un Error con lo que respondió Brevo si falla. */
async function sendWithBrevo({ from, to, subject, html, text }, { apiKey, fetchImpl = fetch } = {}) {
  const res = await fetchImpl(BREVO_URL, {
    method: 'POST',
    headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: from,
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text,
    }),
    signal: AbortSignal.timeout(BREVO_TIMEOUT_MS),
  });
  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = body.message || body.code || '';
    } catch {
      /* sin cuerpo legible */
    }
    throw new Error(`Brevo respondió ${res.status}${detail ? `: ${detail}` : ''}`);
  }
  return res.json().catch(() => ({}));
}

let transporter = null;

async function getTransporter() {
  if (transporter) return transporter;

  if (process.env.SMTP_HOST) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      tls: { rejectUnauthorized: false },
    });

    await transporter.verify();
    console.log('✓ Conexión SMTP verificada');
  } else {
    const test = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      auth: { user: test.user, pass: test.pass },
    });
    console.log('📧 SMTP no configurado — usando Ethereal (pruebas)');
  }

  return transporter;
}

async function sendPasswordReset({ to, resetUrl }, { env = process.env, fetchImpl } = {}) {
  const appName = env.APP_NAME || 'Tattoo Estudio';
  const fromRaw = env.EMAIL_FROM || env.SMTP_FROM || `"${appName}" <noreply@tattoo.app>`;

  const message = {
    to,
    subject: `Recupera tu contraseña — ${appName}`,
    html: `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
</head>
<body style="margin:0;padding:0;background:#07080a;font-family:Georgia,'Times New Roman',serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#07080a;padding:40px 16px">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:480px;background:#0e1013;border:1px solid #23272e;border-radius:6px;overflow:hidden">

          <!-- Cabecera -->
          <tr>
            <td style="padding:32px 36px 24px;border-bottom:1px solid #23272e">
              <p style="margin:0;font-size:13px;font-weight:700;letter-spacing:.22em;text-transform:uppercase;color:#707b86">
                ${appName}
              </p>
            </td>
          </tr>

          <!-- Cuerpo -->
          <tr>
            <td style="padding:32px 36px">
              <h1 style="margin:0 0 12px;font-size:26px;font-weight:600;color:#e7eef2;letter-spacing:-.01em;line-height:1.2">
                Recupera tu contraseña
              </h1>
              <p style="margin:0 0 28px;font-size:15px;line-height:1.6;color:#aab6bf">
                Recibimos una solicitud para restablecer la contraseña de tu cuenta.
                Si fuiste tú, haz clic en el botón de abajo. El enlace expira en <strong style="color:#e7eef2">1 hora</strong>.
              </p>

              <!-- Botón -->
              <table cellpadding="0" cellspacing="0" style="margin-bottom:28px">
                <tr>
                  <td style="background:#e7eef2;border-radius:4px">
                    <a href="${resetUrl}"
                       style="display:inline-block;padding:13px 28px;font-size:13px;font-weight:700;
                              letter-spacing:.14em;text-transform:uppercase;color:#07080a;
                              text-decoration:none">
                      Restablecer contraseña
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px;font-size:13px;color:#707b86">
                Si el botón no funciona, copia y pega este enlace en tu navegador:
              </p>
              <p style="margin:0;font-size:12px;color:#aab6bf;word-break:break-all">
                <a href="${resetUrl}" style="color:#aab6bf">${resetUrl}</a>
              </p>
            </td>
          </tr>

          <!-- Pie -->
          <tr>
            <td style="padding:20px 36px;border-top:1px solid #23272e">
              <p style="margin:0;font-size:12px;color:#4a525b;line-height:1.5">
                Si no solicitaste este cambio, ignora este correo — tu contraseña no se modificará.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
    text: `Recupera tu contraseña\n\nHaz clic en el siguiente enlace (válido por 1 hora):\n${resetUrl}\n\nSi no solicitaste este cambio, ignora este correo.`,
  };

  if (env.BREVO_API_KEY) {
    await sendWithBrevo(
      { ...message, from: parseAddress(fromRaw, appName) },
      { apiKey: env.BREVO_API_KEY, fetchImpl }
    );
    return;
  }

  const t = await getTransporter();
  const info = await t.sendMail({ ...message, from: fromRaw });
  const previewUrl = nodemailer.getTestMessageUrl(info);
  if (previewUrl) {
    console.log('📧 Vista previa Ethereal:', previewUrl);
  }
}

module.exports = { sendPasswordReset, sendWithBrevo, parseAddress };
