/**
 * Atajos para dejar la base en el estado que cada prueba necesita. Usan los
 * mismos modelos que la aplicación, así que lo que preparan es tan real como lo
 * que se está probando.
 */
const pool = require('../../src/config/db');
const userModel = require('../../src/models/userModel');
const clientModel = require('../../src/models/clientModel');
const projectModel = require('../../src/models/projectModel');
const sessionModel = require('../../src/models/sessionModel');
const sketchModel = require('../../src/models/sketchModel');
const materialModel = require('../../src/models/materialModel');

let contador = 0;
const correoUnico = (prefijo) => `${prefijo}-${++contador}-${process.pid}@pruebas.local`;

/** Una cuenta de tatuador. `role`, `active` y `studioId` se ajustan después de crearla. */
async function crearArtista({ name = 'Artista', email, role, active = true, studioId } = {}) {
  const user = await userModel.create({
    name,
    email: email ?? correoUnico('artista'),
    passwordHash: 'hash-de-prueba',
  });
  if (role !== undefined || active !== true || studioId !== undefined) {
    await pool.query(
      `UPDATE users
          SET role = COALESCE($2, role), active = $3, studio_id = COALESCE($4, studio_id)
        WHERE id = $1`,
      [user.id, role ?? null, active, studioId ?? null]
    );
  }
  return user;
}

const crearCliente = (userId, extra = {}) =>
  clientModel.create({ userId, name: 'Cliente', ...extra });

const crearProyecto = (userId, clientId, extra = {}) =>
  projectModel.create({ userId, clientId, title: 'Proyecto', totalPrice: 100000, ...extra });

const crearSesion = (userId, projectId, extra = {}) =>
  sessionModel.create({
    userId,
    projectId,
    startsAt: enDias(7),
    durationMinutes: 120,
    price: 50000,
    ...extra,
  });

const crearBoceto = (userId, extra = {}) =>
  sketchModel.create({
    userId,
    title: 'Boceto',
    description: null,
    bodyZone: null,
    status: 'disponible',
    tags: [],
    storageDriver: 'local',
    storageKey: `sketches/${userId}/${Math.random().toString(36).slice(2)}.png`,
    url: 'http://localhost:3000/uploads/boceto.png',
    mimeType: 'image/png',
    sizeBytes: 1024,
    width: 800,
    height: 600,
    inkRatio: 0.3,
    palette: null,
    ...extra,
  });

const crearInsumo = (userId, extra = {}) =>
  materialModel.create({
    userId,
    name: 'Insumo',
    category: 'tintas',
    unit: 'ml',
    quantity: 100,
    minQuantity: 10,
    unitCost: 600,
    ...extra,
  });

/** Una fecha a N días de ahora, con la hora fijada (UTC) para que no se solapen. */
function enDias(dias, hora = 12) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + dias);
  d.setUTCHours(hora, 0, 0, 0);
  return d.toISOString();
}

module.exports = {
  crearArtista,
  crearCliente,
  crearProyecto,
  crearSesion,
  crearBoceto,
  crearInsumo,
  enDias,
  correoUnico,
};
