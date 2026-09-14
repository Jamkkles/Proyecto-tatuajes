const storage = require('./index');

/**
 * Borra archivos cuyas filas ya se eliminaron de la base de datos.
 * Recibe `[{ storage_driver, storage_key }]` y usa el driver con el que se
 * subió cada uno (no el activo), igual que al borrar un boceto.
 *
 * Los fallos solo se registran: la fila ya no está y el archivo queda huérfano;
 * no vale la pena devolverle un error al usuario por eso.
 */
async function removeFiles(files) {
  await Promise.all(
    files.map(async (file) => {
      try {
        await storage.getDriver(file.storage_driver).remove(file.storage_key);
      } catch (err) {
        console.error('No se pudo borrar el archivo:', err.message);
      }
    })
  );
}

module.exports = { removeFiles };
