const { runReminders } = require('./reminders');

/**
 * Programador interno de los recordatorios (HU22): cada pocos minutos revisa qué
 * citas están a menos de 24 horas y manda el recordatorio de las que faltan.
 *
 * Solo corre mientras el servidor está despierto. En el plan gratuito de Render el
 * servidor se duerme a los 15 minutos sin visitas, así que este programador no
 * basta: un servicio externo que llame a `POST /api/jobs/reminders` cada 10
 * minutos lo mantiene despierto y además dispara lo mismo. Las dos vías pueden
 * coincidir sin problema: cada recordatorio se reclama en `message_log` antes de
 * enviarse y se manda una sola vez.
 */
const DEFAULT_MINUTES = 10;

function start({ env = process.env } = {}) {
  const minutes = Number(env.REMINDER_INTERVAL_MINUTES ?? DEFAULT_MINUTES);
  // 0 (o un valor absurdo) lo apaga: útil si lo dispara solo el servicio externo.
  if (!Number.isFinite(minutes) || minutes < 1) return null;

  let running = false;
  const tick = async () => {
    // Si una corrida tarda más que el intervalo, no se empalma otra encima.
    if (running) return;
    running = true;
    try {
      const summary = await runReminders();
      if (summary.checked > 0) console.log('Recordatorios:', JSON.stringify(summary));
    } catch (err) {
      console.error('Falló la corrida de recordatorios:', err.message);
    } finally {
      running = false;
    }
  };

  const timer = setInterval(tick, minutes * 60 * 1000);
  // No impide que el proceso termine (cierre ordenado, pruebas).
  timer.unref();
  return timer;
}

module.exports = { start, DEFAULT_MINUTES };
