const { encrypt, decrypt } = require('../../utils/secretBox');

/**
 * Credenciales de la sesión de WhatsApp de un artista, guardadas **cifradas** en la
 * base en lugar de en archivos.
 *
 * La librería de WhatsApp pide un «estado de autenticación»: unas credenciales
 * (`creds`) y un almacén de claves de cifrado (`keys`, con `get` y `set`). Su ayudante
 * oficial las guarda en una carpeta de archivos, que aquí no sirve (el disco de Render
 * se borra en cada despliegue y hay un artista por sesión), así que se reimplementa
 * sobre `whatsapp_auth`.
 *
 * `baileys` se recibe por parámetro (solo se usan `BufferJSON`, `initAuthCreds` y
 * `proto`) para poder probar esto sin cargar la librería de verdad.
 */
async function loadAuthState(userId, { baileys, store, env = process.env }) {
  const { BufferJSON, initAuthCreds, proto } = baileys;

  // BufferJSON conserva los Buffer (las claves son binarias) al pasar por JSON.
  const seal = (value) => encrypt(JSON.stringify(value, BufferJSON.replacer), env);
  const open = (token) => JSON.parse(decrypt(token, env), BufferJSON.reviver);

  const stored = await store.getValue(userId, 'creds', 'main');
  const creds = stored ? open(stored) : initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        async get(type, ids) {
          const rows = await store.getValues(userId, type, ids);
          const data = {};
          for (const id of ids) {
            const token = rows.get(id);
            if (!token) continue;
            let value = open(token);
            // Esta clave la espera la librería como mensaje protobuf, no como objeto.
            if (type === 'app-state-sync-key' && value) {
              value = proto.Message.AppStateSyncKeyData.fromObject(value);
            }
            data[id] = value;
          }
          return data;
        },

        async set(data) {
          const entries = [];
          for (const type of Object.keys(data)) {
            for (const id of Object.keys(data[type])) {
              const value = data[type][id];
              entries.push({ type, id, value: value ? seal(value) : null });
            }
          }
          if (entries.length) await store.setValues(userId, entries);
        },
      },
    },

    // La librería modifica `creds` en su sitio y avisa con `creds.update`.
    saveCreds: () => store.setValues(userId, [{ type: 'creds', id: 'main', value: seal(creds) }]),
  };
}

module.exports = { loadAuthState };
