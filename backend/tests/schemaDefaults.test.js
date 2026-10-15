const fs = require('fs');
const path = require('path');
const { DEFAULT_SETTINGS } = require('../src/models/notificationSettingsModel');

const schema = fs.readFileSync(path.join(__dirname, '../src/db/schema.sql'), 'utf8');

// Los textos por defecto viven en dos sitios: el DEFAULT de la columna (cuando se
// crea la fila) y la constante de JS (cuando el artista nunca la creó). Si
// divergen, el mismo artista vería dos textos distintos según haya o no guardado
// alguna vez su configuración.
function defaultOf(column) {
  const match = new RegExp(`${column}\\s+TEXT NOT NULL\\s+DEFAULT '((?:[^']|'')*)'`).exec(schema);
  return match ? match[1].replace(/''/g, "'") : null;
}

describe('valores por defecto de notification_settings', () => {
  test('el texto del recordatorio coincide con el del esquema', () => {
    expect(defaultOf('reminder_note')).toBe(DEFAULT_SETTINGS.reminderNote);
  });

  test('el texto de cuidados coincide con el del esquema', () => {
    expect(defaultOf('aftercare_note')).toBe(DEFAULT_SETTINGS.aftercareNote);
  });

  test('los tres avisos arrancan encendidos en los dos lados', () => {
    for (const column of ['reminders_enabled', 'change_notice_enabled', 'aftercare_enabled']) {
      expect(schema).toMatch(new RegExp(`${column}\\s+BOOLEAN NOT NULL DEFAULT true`));
    }
    expect(DEFAULT_SETTINGS).toMatchObject({ remindersEnabled: true, changeNoticeEnabled: true, aftercareEnabled: true });
  });

  test('los textos por defecto cumplen lo que exige el guardado', () => {
    expect(DEFAULT_SETTINGS.reminderNote.length).toBeLessThanOrEqual(300);
    expect(DEFAULT_SETTINGS.aftercareNote.length).toBeLessThanOrEqual(600);
    // Una sola línea: WhatsApp no admite saltos de línea en los parámetros.
    expect(DEFAULT_SETTINGS.reminderNote).not.toMatch(/\s{2,}|\n/);
    expect(DEFAULT_SETTINGS.aftercareNote).not.toMatch(/\s{2,}|\n/);
  });
});
