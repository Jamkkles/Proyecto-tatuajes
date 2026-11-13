/**
 * La batería de integración corre contra una base aparte, nunca contra la de
 * desarrollo: se toma la cadena de conexión del entorno y se le cambia el
 * nombre de la base por `tatuajes_test` (o lo que diga TEST_DB_NAME).
 */
const POR_DEFECTO = 'postgresql://tatuajes_user:tatuajes_pass@postgres:5432/tatuajes_db';

const NOMBRE_PRUEBAS = process.env.TEST_DB_NAME || 'tatuajes_test';

function urlAdministracion() {
  return process.env.DATABASE_URL || POR_DEFECTO;
}

function urlPruebas() {
  const url = new URL(urlAdministracion());
  url.pathname = `/${NOMBRE_PRUEBAS}`;
  return url.toString();
}

module.exports = { urlAdministracion, urlPruebas, NOMBRE_PRUEBAS };
