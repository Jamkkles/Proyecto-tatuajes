/**
 * Se ejecuta antes de que el archivo de prueba cargue nada, porque
 * `config/db.js` lee DATABASE_URL al ser requerido: si se cambiara después, el
 * pool ya estaría apuntando a la base equivocada.
 */
const { urlPruebas } = require('./urlBase');

process.env.DATABASE_URL = urlPruebas();
process.env.JWT_SECRET = process.env.JWT_SECRET || 'secreto_solo_para_pruebas_de_integracion';
process.env.NODE_ENV = 'test';
