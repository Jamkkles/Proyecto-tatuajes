const { loadAuthState } = require('../src/services/whatsappWeb/authState');

const ENV = { WHATSAPP_AUTH_KEY: 'k'.repeat(40) };

// Los mismos reemplazos que usa Baileys para que los Buffer sobrevivan al paso por JSON.
const BufferJSON = {
  replacer: (_k, value) => {
    if (value?.type === 'Buffer' && Array.isArray(value.data)) {
      return { type: 'Buffer', data: Buffer.from(value.data).toString('base64') };
    }
    return value;
  },
  reviver: (_k, value) => {
    if (value && typeof value === 'object' && value.type === 'Buffer') {
      return typeof value.data === 'string' ? Buffer.from(value.data, 'base64') : Buffer.from(value.data || []);
    }
    return value;
  },
};

const baileys = {
  BufferJSON,
  initAuthCreds: () => ({ registered: false, noiseKey: Buffer.from([1, 2, 3]) }),
  proto: { Message: { AppStateSyncKeyData: { fromObject: (o) => ({ __protobuf: true, ...o }) } } },
};

/** Un almacén en memoria con la misma interfaz que el modelo. */
function memoryStore() {
  const data = new Map();
  const k = (u, t, i) => `${u}|${t}|${i}`;
  return {
    data,
    getValue: async (u, t, i) => data.get(k(u, t, i)) ?? null,
    getValues: async (u, t, ids) => new Map(ids.filter((i) => data.has(k(u, t, i))).map((i) => [i, data.get(k(u, t, i))])),
    setValues: async (u, entries) => {
      for (const e of entries) {
        if (e.value === null || e.value === undefined) data.delete(k(u, e.type, e.id));
        else data.set(k(u, e.type, e.id), e.value);
      }
    },
  };
}

describe('estado de autenticación de WhatsApp en la base', () => {
  test('una sesión nueva parte de credenciales nuevas y sin registrar', async () => {
    const { state } = await loadAuthState('u1', { baileys, store: memoryStore(), env: ENV });
    expect(state.creds.registered).toBe(false);
    expect(Buffer.isBuffer(state.creds.noiseKey)).toBe(true);
  });

  test('las credenciales guardadas se recuperan con sus Buffer intactos', async () => {
    const store = memoryStore();
    const first = await loadAuthState('u1', { baileys, store, env: ENV });
    first.state.creds.registered = true;
    first.state.creds.me = { id: '56912345678:1@s.whatsapp.net' };
    first.state.creds.noiseKey = Buffer.from([9, 8, 7, 6]);
    await first.saveCreds();

    const again = await loadAuthState('u1', { baileys, store, env: ENV });
    expect(again.state.creds.registered).toBe(true);
    expect(again.state.creds.me.id).toBe('56912345678:1@s.whatsapp.net');
    expect(Buffer.isBuffer(again.state.creds.noiseKey)).toBe(true);
    expect([...again.state.creds.noiseKey]).toEqual([9, 8, 7, 6]);
  });

  test('lo que llega a la base va cifrado: nada de la sesión queda en claro', async () => {
    const store = memoryStore();
    const { state, saveCreds } = await loadAuthState('u1', { baileys, store, env: ENV });
    state.creds.me = { id: 'SECRETO-DEL-USUARIO' };
    await saveCreds();
    await state.keys.set({ session: { '56912345678.0': { clave: 'CLAVE-PRIVADA-DE-SIGNAL' } } });

    for (const value of store.data.values()) {
      expect(value.startsWith('v1.')).toBe(true);
      expect(value).not.toContain('SECRETO');
      expect(value).not.toContain('CLAVE-PRIVADA');
    }
    expect(store.data.size).toBe(2);
  });

  test('las claves se guardan y se leen por tipo y por id', async () => {
    const store = memoryStore();
    const { state } = await loadAuthState('u1', { baileys, store, env: ENV });
    await state.keys.set({
      'pre-key': { 1: { private: Buffer.from([1]), public: Buffer.from([2]) }, 2: { private: Buffer.from([3]), public: Buffer.from([4]) } },
      session: { 'a.0': { raiz: Buffer.from([5, 5]) } },
    });

    const preKeys = await state.keys.get('pre-key', ['1', '2', '3']);
    expect(Object.keys(preKeys).sort()).toEqual(['1', '2']); // la 3 no existe: no aparece
    expect([...preKeys['1'].private]).toEqual([1]);
    expect([...(await state.keys.get('session', ['a.0']))['a.0'].raiz]).toEqual([5, 5]);
  });

  test('una clave con valor nulo se borra', async () => {
    const store = memoryStore();
    const { state } = await loadAuthState('u1', { baileys, store, env: ENV });
    await state.keys.set({ 'pre-key': { 7: { x: 1 } } });
    expect(Object.keys(await state.keys.get('pre-key', ['7']))).toEqual(['7']);

    await state.keys.set({ 'pre-key': { 7: null } });
    expect(await state.keys.get('pre-key', ['7'])).toEqual({});
    expect(store.data.size).toBe(0);
  });

  test('la clave de sincronización se devuelve como mensaje protobuf, como la espera la librería', async () => {
    const store = memoryStore();
    const { state } = await loadAuthState('u1', { baileys, store, env: ENV });
    await state.keys.set({ 'app-state-sync-key': { AAA: { keyData: 'datos' } } });
    const got = await state.keys.get('app-state-sync-key', ['AAA']);
    expect(got.AAA.__protobuf).toBe(true);
    expect(got.AAA.keyData).toBe('datos');
  });

  test('cada artista tiene lo suyo: una sesión no ve las claves de otra', async () => {
    const store = memoryStore();
    const a = await loadAuthState('ana', { baileys, store, env: ENV });
    const b = await loadAuthState('beto', { baileys, store, env: ENV });
    await a.state.keys.set({ session: { x: { de: 'ana' } } });
    expect(await b.state.keys.get('session', ['x'])).toEqual({});
    expect((await a.state.keys.get('session', ['x'])).x.de).toBe('ana');
  });

  test('sin clave de cifrado no guarda nada en claro: falla', async () => {
    const store = memoryStore();
    const { state } = await loadAuthState('u1', { baileys, store, env: {} });
    await expect(state.keys.set({ session: { x: { a: 1 } } })).rejects.toThrow(/WHATSAPP_AUTH_KEY/);
    expect(store.data.size).toBe(0);
  });

  test('con otra clave la sesión guardada no se puede abrir', async () => {
    const store = memoryStore();
    const { saveCreds } = await loadAuthState('u1', { baileys, store, env: ENV });
    await saveCreds();
    await expect(
      loadAuthState('u1', { baileys, store, env: { WHATSAPP_AUTH_KEY: 'otra-clave-distinta-de-treinta-y-dos-caracteres' } })
    ).rejects.toThrow(/descifrar/);
  });
});
