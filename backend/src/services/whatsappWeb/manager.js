/**
 * WhatsApp vinculado: envío automático y gratuito desde el propio número del artista.
 *
 * **Esto NO es la API oficial.** El artista vincula su WhatsApp como un «dispositivo
 * vinculado» (igual que WhatsApp Web) y el servidor habla con WhatsApp haciéndose pasar
 * por ese dispositivo, con la librería Baileys. Funciona y no cuesta por mensaje, pero
 * los términos de WhatsApp no permiten automatizar así una cuenta, y **puede bloquear el
 * número**. Por eso:
 *   - está apagado salvo que el servidor lo active (`WHATSAPP_WEB_ENABLED=true`);
 *   - el artista tiene que aceptar el riesgo antes de vincular;
 *   - se envía despacio y con tope por hora, a números que existen en WhatsApp, y solo
 *     mensajes sueltos a clientes (nunca difusión masiva);
 *   - ante cualquier fallo el mensaje cae al camino manual, así que no se pierde.
 *
 * Cada artista tiene su propia sesión. Se conecta **al enviar** y se cierra tras unos
 * minutos sin uso: así no hay una conexión abierta por artista permanentemente (en el
 * plan gratuito de Render son 512 MB) y sobrevive a que el servidor se duerma.
 *
 * La fábrica recibe todas sus dependencias, y por eso se prueba entera con una
 * librería simulada.
 */
const { hasKey } = require('../../utils/secretBox');

class WhatsAppWebError extends Error {
  constructor(message, { code = 'error' } = {}) {
    super(message);
    this.name = 'WhatsAppWebError';
    this.code = code;
  }
}

// Códigos de estado con los que WhatsApp cierra la conexión (los de DisconnectReason
// de Baileys). Se repiten aquí para no depender de la librería al decidir qué hacer.
const LOGGED_OUT = 401;
const RESTART_REQUIRED = 515;

const MINUTE = 60_000;

/** Un valor de configuración numérico, o el por defecto si falta o es absurdo. */
const number = (raw, fallback) => {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

function settings(env = process.env) {
  const flag = env.WHATSAPP_WEB_ENABLED === 'true';
  return {
    flag,
    enabled: flag && hasKey(env),
    // Si se pidió activarlo pero falta la clave de cifrado, se dice por qué no está activo.
    problem: flag && !hasKey(env) ? 'falta_clave' : null,
    perHour: number(env.WHATSAPP_WEB_MAX_PER_HOUR, 15),
    maxSessions: number(env.WHATSAPP_WEB_MAX_SESSIONS, 3),
    idleMs: number(env.WHATSAPP_WEB_IDLE_MINUTES, 5) * MINUTE,
    linkTimeoutMs: 3 * MINUTE,
    connectTimeoutMs: 30_000,
  };
}

/** «ABCD1234» → «ABCD-1234», que se lee mejor en pantalla. */
const prettyCode = (code) => (/^[A-Z0-9]{8}$/i.test(code) ? `${code.slice(0, 4)}-${code.slice(4)}`.toUpperCase() : code);

/** El número de un jid como `56912345678:12@s.whatsapp.net`. */
const phoneOfJid = (jid) => String(jid ?? '').split('@')[0].split(':')[0] || null;

function createManager({
  loadBaileys,
  store,
  loadAuthState,
  messageLog,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  random = Math.random,
  now = () => Date.now(),
  logger = { error: console.error, warn: () => {} },
}) {
  /** @type {Map<string, any>} */
  const entries = new Map();

  const silent = {
    level: 'silent',
    child() { return silent; },
    trace() {}, debug() {}, info() {}, warn() {}, error() {}, fatal() {},
  };

  const entryOf = (userId) => {
    let entry = entries.get(userId);
    if (!entry) {
      entry = {
        userId,
        sock: null,
        state: 'cerrado', // cerrado | conectando | esperando_codigo | conectado | caido
        generation: 0,
        pairingCode: null,
        waiters: [],
        queue: Promise.resolve(),
        lastSentAt: 0,
        attempts: 0,
        idleTimer: null,
        linkTimer: null,
      };
      entries.set(userId, entry);
    }
    return entry;
  };

  const settle = (entry, error) => {
    const waiters = entry.waiters.splice(0);
    for (const w of waiters) (error ? w.reject(error) : w.resolve());
  };

  const waitForOpen = (entry, timeoutMs) =>
    new Promise((resolve, reject) => {
      if (entry.state === 'conectado') return resolve();
      const timer = setTimeout(() => {
        reject(new WhatsAppWebError('WhatsApp tardó demasiado en conectarse.', { code: 'sin_conexion' }));
      }, timeoutMs);
      entry.waiters.push({
        resolve: () => { clearTimeout(timer); resolve(); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
    });

  function closeSocket(entry) {
    clearTimeout(entry.idleTimer);
    entry.generation += 1; // los eventos que lleguen del socket viejo se ignoran
    const { sock } = entry;
    entry.sock = null;
    if (sock) {
      try { sock.end(undefined); } catch { /* ya estaba cerrado */ }
    }
  }

  const touchIdle = (entry, idleMs) => {
    clearTimeout(entry.idleTimer);
    entry.idleTimer = setTimeout(() => {
      if (entry.state === 'conectado') {
        closeSocket(entry);
        entry.state = 'cerrado';
      }
    }, idleMs);
    entry.idleTimer.unref?.();
  };

  /** Borra todo rastro de la sesión: ya no está vinculada. */
  async function forget(userId) {
    const entry = entries.get(userId);
    if (entry) {
      clearTimeout(entry.linkTimer);
      closeSocket(entry);
      settle(entry, new WhatsAppWebError('La sesión de WhatsApp se cerró.', { code: 'desvinculado' }));
      entries.delete(userId);
    }
    await store.deleteAll(userId);
  }

  /**
   * Abre el socket de un artista y engancha sus eventos. Con `pairingPhone` pide el
   * código de emparejamiento en cuanto la conexión está lista (vincular por primera vez).
   */
  async function openSocket(userId, { pairingPhone = null, cfg }) {
    const entry = entryOf(userId);
    closeSocket(entry);
    entry.state = 'conectando';
    entry.pairingCode = null;
    const generation = entry.generation;

    const baileys = await loadBaileys().catch(() => {
      throw new WhatsAppWebError(
        'La librería de WhatsApp no está instalada en el servidor (@whiskeysockets/baileys).',
        { code: 'sin_libreria' }
      );
    });
    const { state, saveCreds } = await loadAuthState(userId, { baileys, store });
    const version = await baileys.fetchLatestBaileysVersion?.().then((r) => r.version).catch(() => undefined);
    const makeSocket = baileys.makeWASocket ?? baileys.default;

    const sock = makeSocket({
      version,
      auth: { creds: state.creds, keys: baileys.makeCacheableSignalKeyStore?.(state.keys, silent) ?? state.keys },
      logger: silent,
      // Un navegador conocido: sin él WhatsApp rechaza el código de emparejamiento.
      browser: baileys.Browsers?.ubuntu?.('Chrome'),
      printQRInTerminal: false,
      markOnlineOnConnect: false,
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
    });
    entry.sock = sock;

    sock.ev.on('creds.update', () => saveCreds().catch((e) => logger.error('No se pudo guardar la sesión de WhatsApp:', e.message)));

    let codeRequested = false;
    sock.ev.on('connection.update', async (update) => {
      if (entry.generation !== generation) return; // evento de un socket que ya se cerró
      const { connection, lastDisconnect, qr } = update;

      // Con el socket listo (WhatsApp envía el QR que no vamos a usar), se pide el código.
      if (pairingPhone && qr && !codeRequested && !state.creds.registered) {
        codeRequested = true;
        try {
          entry.pairingCode = prettyCode(await sock.requestPairingCode(pairingPhone));
          entry.state = 'esperando_codigo';
        } catch (err) {
          settle(entry, new WhatsAppWebError(`WhatsApp no entregó el código: ${err.message}`, { code: 'sin_codigo' }));
        }
        return settle(entry);
      }

      if (connection === 'open') {
        entry.state = 'conectado';
        entry.attempts = 0;
        clearTimeout(entry.linkTimer);
        const phone = phoneOfJid(sock.user?.id);
        const session = await store.getSession(userId);
        if (!session || session.status !== 'vinculado') {
          await store.saveSession(userId, { status: 'vinculado', phone });
        }
        touchIdle(entry, cfg.idleMs);
        return settle(entry);
      }

      if (connection === 'close') {
        const code = lastDisconnect?.error?.output?.statusCode;

        // El usuario cerró la sesión desde su teléfono: ya no hay nada que usar.
        if (code === LOGGED_OUT) {
          await forget(userId).catch((e) => logger.error('No se pudo limpiar la sesión:', e.message));
          return;
        }
        // Tras vincular, WhatsApp pide reabrir la conexión con las credenciales nuevas.
        if (code === RESTART_REQUIRED) {
          return openSocket(userId, { cfg }).catch((e) => settle(entry, e));
        }

        const linked = (await store.getSession(userId))?.status === 'vinculado';
        if (linked && entry.attempts < 3) {
          entry.attempts += 1;
          await sleep(2000 * entry.attempts);
          if (entry.generation === generation) {
            return openSocket(userId, { cfg }).catch((e) => settle(entry, e));
          }
          return;
        }
        entry.state = 'caido';
        settle(entry, new WhatsAppWebError('Se perdió la conexión con WhatsApp.', { code: 'sin_conexion' }));
      }
    });

    return entry;
  }

  /* ---------------- API ---------------- */

  /**
   * Empieza a vincular: devuelve el código de 8 caracteres que el artista escribe en su
   * WhatsApp (Dispositivos vinculados → Vincular con el número de teléfono).
   */
  async function startLinking(userId, phoneDigits, { env = process.env } = {}) {
    const cfg = settings(env);
    if (!cfg.enabled) throw new WhatsAppWebError('El WhatsApp vinculado no está activado en el servidor.', { code: 'desactivado' });

    const session = await store.getSession(userId);
    if (session?.status === 'vinculado') {
      throw new WhatsAppWebError('Ya tienes un WhatsApp vinculado. Desvincúlalo antes de vincular otro.', { code: 'ya_vinculado' });
    }
    // Un intento anterior sin terminar se descarta: cada vinculación parte de cero.
    await forget(userId);
    await store.saveSession(userId, { status: 'vinculando', phone: phoneDigits });

    const entry = await openSocket(userId, { pairingPhone: phoneDigits, cfg });
    await waitForCode(entry, cfg.connectTimeoutMs);

    // Si no escribe el código a tiempo, se descarta la vinculación a medias.
    entry.linkTimer = setTimeout(() => {
      if (entry.state === 'esperando_codigo') forget(userId).catch(() => {});
    }, cfg.linkTimeoutMs);
    entry.linkTimer.unref?.();

    return { pairingCode: entry.pairingCode };
  }

  const waitForCode = (entry, timeoutMs) =>
    new Promise((resolve, reject) => {
      if (entry.pairingCode) return resolve();
      const timer = setTimeout(
        () => reject(new WhatsAppWebError('WhatsApp tardó demasiado en responder. Inténtalo de nuevo.', { code: 'sin_codigo' })),
        timeoutMs
      );
      entry.waiters.push({
        resolve: () => { clearTimeout(timer); resolve(); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
    });

  /** Estado de la vinculación de un artista, para la pantalla. */
  async function getStatus(userId, { env = process.env } = {}) {
    const cfg = settings(env);
    const base = { enabled: cfg.enabled, problem: cfg.problem, perHour: cfg.perHour };
    if (!cfg.enabled) return { ...base, status: 'desactivado' };

    const entry = entries.get(userId);
    const session = await store.getSession(userId);

    if (entry?.state === 'esperando_codigo') {
      return { ...base, status: 'esperando_codigo', pairingCode: entry.pairingCode, phone: session?.phone ?? null };
    }
    if (session?.status === 'vinculado') {
      return { ...base, status: 'vinculado', phone: session.phone, connected: entry?.state === 'conectado' };
    }
    // Tras escribir el código, WhatsApp cierra y reabre la conexión un instante antes de
    // confirmar. En esa ventana todavía no está «vinculado», pero tampoco «desvinculado»:
    // la pantalla tiene que seguir esperando en vez de volver al formulario.
    if (session?.status === 'vinculando' && entry && entry.state !== 'caido' && entry.state !== 'cerrado') {
      return { ...base, status: 'vinculando', phone: session.phone ?? null };
    }
    // «vinculando» sin conexión viva: el servidor se reinició a mitad de camino.
    return { ...base, status: 'desvinculado' };
  }

  /** ¿Se pueden enviar mensajes de este artista por su WhatsApp vinculado? */
  async function isReady(userId, { env = process.env } = {}) {
    if (!settings(env).enabled) return false;
    return (await store.getSession(userId))?.status === 'vinculado';
  }

  async function ensureConnected(userId, cfg) {
    const entry = entryOf(userId);
    if (entry.state === 'conectado' && entry.sock) return entry;

    if ((await store.getSession(userId))?.status !== 'vinculado') {
      throw new WhatsAppWebError('No hay un WhatsApp vinculado.', { code: 'no_vinculado' });
    }

    // Pocas conexiones a la vez: si se llegó al tope se cierra la más ociosa.
    const live = [...entries.values()].filter((e) => e.sock && e !== entry);
    if (live.length >= cfg.maxSessions) {
      const idle = live.filter((e) => e.state === 'conectado').sort((a, b) => a.lastSentAt - b.lastSentAt)[0];
      if (!idle) throw new WhatsAppWebError('Hay demasiadas conexiones de WhatsApp abiertas. Inténtalo en un momento.', { code: 'sin_cupo' });
      closeSocket(idle);
      idle.state = 'cerrado';
    }

    if (entry.state !== 'conectando') await openSocket(userId, { cfg });
    await waitForOpen(entry, cfg.connectTimeoutMs);
    return entry;
  }

  /** Tiempo de «escribiendo…» proporcional al texto, con algo de azar. */
  const typingMs = (text) => Math.min(5000, Math.max(1500, text.length * 25)) + Math.floor(random() * 1000);
  /** Pausa entre un mensaje y el siguiente del mismo artista: de 4 a 9 segundos. */
  const gapMs = () => 4000 + Math.floor(random() * 5000);

  /**
   * Envía un mensaje de texto a un número. Los envíos de un mismo artista van en fila,
   * uno tras otro y con pausa, nunca en ráfaga.
   *
   * @returns {Promise<{ id: string }>}
   */
  function sendText(userId, phoneDigits, text, { env = process.env } = {}) {
    const cfg = settings(env);
    if (!cfg.enabled) return Promise.reject(new WhatsAppWebError('El WhatsApp vinculado no está activado.', { code: 'desactivado' }));

    const entry = entryOf(userId);
    const job = entry.queue.then(async () => {
      if ((await messageLog.countRecent(userId, 'whatsapp_web', 60)) >= cfg.perHour) {
        throw new WhatsAppWebError(
          `Se alcanzó el tope de ${cfg.perHour} mensajes por hora. El resto queda para enviarlo a mano.`,
          { code: 'tope' }
        );
      }

      const live = await ensureConnected(userId, cfg);
      const { sock } = live;

      // Solo se escribe a números que existen en WhatsApp: mandar a números sin cuenta
      // es una de las señales que más delata a una cuenta automatizada.
      const [found] = (await sock.onWhatsApp(`${phoneDigits}@s.whatsapp.net`)) ?? [];
      if (!found?.exists) {
        throw new WhatsAppWebError('Ese número no tiene WhatsApp.', { code: 'sin_whatsapp' });
      }

      // Una pausa respecto del mensaje anterior, y «escribiendo…» como haría una persona.
      const wait = live.lastSentAt + gapMs() - now();
      if (wait > 0) await sleep(wait);
      await sock.sendPresenceUpdate('composing', found.jid).catch(() => {});
      await sleep(typingMs(text));
      await sock.sendPresenceUpdate('paused', found.jid).catch(() => {});

      const sent = await sock.sendMessage(found.jid, { text });
      live.lastSentAt = now();
      touchIdle(live, cfg.idleMs);
      return { id: sent?.key?.id ?? null };
    });
    // La fila sigue aunque un envío falle.
    entry.queue = job.catch(() => {});
    return job;
  }

  /** Un mensaje al propio número del artista («Mensajes contigo mismo»), para comprobar que funciona. */
  async function sendTest(userId, { env = process.env } = {}) {
    const cfg = settings(env);
    if (!cfg.enabled) throw new WhatsAppWebError('El WhatsApp vinculado no está activado.', { code: 'desactivado' });

    const live = await ensureConnected(userId, cfg);
    const own = live.sock.user?.id;
    if (!own) throw new WhatsAppWebError('WhatsApp no informó cuál es tu número.', { code: 'sin_conexion' });

    const jid = `${phoneOfJid(own)}@s.whatsapp.net`;
    const sent = await live.sock.sendMessage(jid, {
      text: 'Tattoo Estudio: tu WhatsApp quedó vinculado. Desde ahora los recordatorios a tus clientes saldrán desde este número.',
    });
    touchIdle(live, cfg.idleMs);
    return { id: sent?.key?.id ?? null };
  }

  /** Desvincula: cierra la sesión también en WhatsApp (desaparece de «Dispositivos vinculados»). */
  async function unlink(userId) {
    const entry = entries.get(userId);
    if (entry?.sock) {
      try { await entry.sock.logout(); } catch { /* sin conexión: igual se borra lo nuestro */ }
    }
    await forget(userId);
  }

  function shutdown() {
    for (const entry of entries.values()) {
      clearTimeout(entry.linkTimer);
      closeSocket(entry);
    }
    entries.clear();
  }

  return { startLinking, getStatus, isReady, sendText, sendTest, unlink, shutdown, settings, _entries: entries };
}

module.exports = { createManager, WhatsAppWebError, settings, prettyCode, phoneOfJid };
