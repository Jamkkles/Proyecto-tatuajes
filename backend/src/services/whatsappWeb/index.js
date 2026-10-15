const store = require('../../models/whatsappAuthModel');
const messageLog = require('../../models/messageLogModel');
const { loadAuthState } = require('./authState');
const { createManager, WhatsAppWebError, settings } = require('./manager');

/**
 * El gestor de WhatsApp vinculado con sus dependencias reales.
 *
 * La librería se carga **al usarla** y con `import()`: es un módulo ESM y el backend es
 * CommonJS, y así un servidor que no activa esta función ni siquiera la necesita en disco.
 */
const manager = createManager({
  loadBaileys: () => import('@whiskeysockets/baileys'),
  store,
  loadAuthState,
  messageLog,
});

module.exports = { ...manager, WhatsAppWebError, settings };
