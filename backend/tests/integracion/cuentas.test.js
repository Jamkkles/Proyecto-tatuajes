/**
 * Cuentas y estudios contra la base real: lo que las pruebas con dobles no
 * pueden comprobar, porque lo que se verifica aquí es el SQL mismo.
 */
const pool = require('../../src/config/db');
const userModel = require('../../src/models/userModel');
const studioModel = require('../../src/models/studioModel');
const { crearArtista, crearCliente, crearProyecto, crearSesion, crearBoceto, correoUnico } =
  require('./datos');

describe('userModel', () => {
  test('crea una cuenta y la encuentra por correo sin distinguir mayúsculas', async () => {
    const email = 'Artista.Mayus@Pruebas.Local';
    const creado = await userModel.create({ name: 'Ana', email, passwordHash: 'hash' });

    const porCorreo = await userModel.findByEmail('artista.mayus@pruebas.local');
    expect(porCorreo.id).toBe(creado.id);
    expect(porCorreo.password_hash).toBe('hash');
    expect(porCorreo.role).toBe('tatuador');
    expect(porCorreo.active).toBe(true);
  });

  test('devuelve null cuando el correo no existe', async () => {
    expect(await userModel.findByEmail('nadie@pruebas.local')).toBeNull();
    expect(await userModel.findById('00000000-0000-0000-0000-000000000000')).toBeNull();
    expect(await userModel.findAuthById('00000000-0000-0000-0000-000000000000')).toBeNull();
  });

  test('el correo es único', async () => {
    const email = correoUnico('repetido');
    await userModel.create({ name: 'Uno', email, passwordHash: 'hash' });
    await expect(
      userModel.create({ name: 'Dos', email, passwordHash: 'hash' })
    ).rejects.toThrow();
  });

  test('findAccess dice si la cuenta y su estudio siguen activos', async () => {
    const { studio, user } = await studioModel.createWithOwner({
      studio: { name: 'Estudio', email: correoUnico('estudio') },
      owner: { name: 'Dueño', email: correoUnico('dueno'), passwordHash: 'hash' },
    });

    const inicial = await userModel.findAccess(user.id);
    expect(inicial).toMatchObject({ role: 'tatuador', active: true, studio_active: true });

    await studioModel.update(studio.id, { active: false });
    expect((await userModel.findAccess(user.id)).studio_active).toBe(false);

    await userModel.setActive(user.id, false);
    expect((await userModel.findAccess(user.id)).active).toBe(false);

    expect(await userModel.findAccess('00000000-0000-0000-0000-000000000000')).toBeNull();
  });

  test('una cuenta sin estudio no queda sin acceso por eso', async () => {
    const user = await crearArtista({ name: 'Suelta' });
    const acceso = await userModel.findAccess(user.id);
    expect(acceso.active).toBe(true);
    expect(acceso.studio_active).toBeNull();
  });

  test('cambiar la contraseña marca o desmarca el cambio obligatorio', async () => {
    const user = await crearArtista();

    await userModel.updatePassword(user.id, 'hash-temporal', { mustChange: true });
    expect((await userModel.findByEmail(user.email)).must_change_password).toBe(true);

    await userModel.updatePassword(user.id, 'hash-propio');
    const despues = await userModel.findByEmail(user.email);
    expect(despues.must_change_password).toBe(false);
    expect(despues.password_hash).toBe('hash-propio');

    expect((await userModel.findAuthById(user.id)).password_hash).toBe('hash-propio');
  });

  test('cuenta los administradores activos', async () => {
    expect(await userModel.countActiveAdmins()).toBe(0);

    const admin = await crearArtista({ name: 'Admin', role: 'admin' });
    await crearArtista({ name: 'Otro admin', role: 'admin' });
    expect(await userModel.countActiveAdmins()).toBe(2);

    await userModel.setActive(admin.id, false);
    expect(await userModel.countActiveAdmins()).toBe(1);
  });

  test('setActive devuelve null si la cuenta no existe', async () => {
    expect(await userModel.setActive('00000000-0000-0000-0000-000000000000', false)).toBeNull();
  });

  test('el listado del administrador trae el uso de cada cuenta', async () => {
    const { user } = await studioModel.createWithOwner({
      studio: { name: 'Estudio con datos', email: correoUnico('estudio'), plan: 'profesional' },
      owner: { name: 'Dueña', email: correoUnico('dueno'), passwordHash: 'hash' },
    });
    const cliente = await crearCliente(user.id);
    const proyecto = await crearProyecto(user.id, cliente.id);
    await crearSesion(user.id, proyecto.id);
    await crearBoceto(user.id);
    await crearArtista({ name: 'Sin nada' });

    const filas = await userModel.listAllWithStats();
    expect(filas).toHaveLength(2);

    const conDatos = filas.find((f) => f.id === user.id);
    expect(conDatos).toMatchObject({
      studio_name: 'Estudio con datos',
      studio_plan: 'profesional',
      is_owner: true,
      sessions_total: 1,
      upcoming_appointments: 1,
      sketches_total: 1,
      clients_total: 1,
    });
    expect(conDatos.last_activity_at).not.toBeNull();

    const vacia = filas.find((f) => f.id !== user.id);
    expect(vacia).toMatchObject({
      studio_name: null,
      is_owner: false,
      sessions_total: 0,
      clients_total: 0,
    });
    expect(vacia.last_activity_at).toBeNull();
  });
});

describe('studioModel', () => {
  test('crea el estudio y su dueño en una sola transacción', async () => {
    const { studio, user } = await studioModel.createWithOwner({
      studio: { name: 'Tinta Negra', email: 'contacto@tinta.local', plan: 'estudio' },
      owner: { name: 'Hugo', email: correoUnico('hugo'), passwordHash: 'hash', mustChange: true },
    });

    expect(studio).toMatchObject({ name: 'Tinta Negra', plan: 'estudio', active: true });
    expect(studio.owner_id).toBe(user.id);
    expect(user.studio_id).toBe(studio.id);

    const guardado = await userModel.findByEmail(user.email);
    expect(guardado.must_change_password).toBe(true);
    expect(guardado.studio_id).toBe(studio.id);
  });

  test('si el correo del dueño ya existe no queda un estudio a medias', async () => {
    const email = correoUnico('ocupado');
    await crearArtista({ email });

    await expect(
      studioModel.createWithOwner({
        studio: { name: 'Estudio fallido', email: correoUnico('estudio') },
        owner: { name: 'Repetido', email, passwordHash: 'hash' },
      })
    ).rejects.toThrow();

    const { rows } = await pool.query("SELECT count(*)::int AS n FROM studios WHERE name = 'Estudio fallido'");
    expect(rows[0].n).toBe(0);
  });

  test('agrega un tatuador al estudio y rechaza un estudio inexistente', async () => {
    const { studio } = await studioModel.createWithOwner({
      studio: { name: 'Estudio', email: correoUnico('estudio') },
      owner: { name: 'Dueño', email: correoUnico('dueno'), passwordHash: 'hash' },
    });

    const nuevo = await studioModel.addTattooist(studio.id, {
      name: 'Tatuador nuevo',
      email: correoUnico('tatuador'),
      passwordHash: 'hash',
      mustChange: true,
    });
    expect(nuevo.studio_id).toBe(studio.id);

    expect(
      await studioModel.addTattooist('00000000-0000-0000-0000-000000000000', {
        name: 'Nadie',
        email: correoUnico('nadie'),
        passwordHash: 'hash',
      })
    ).toBeNull();
  });

  test('ensureOwnStudios le da estudio a quien no tiene y no repite', async () => {
    await crearArtista({ name: 'Solitario' });
    await crearArtista({ name: 'Solitaria' });
    await crearArtista({ name: 'Admin sin estudio', role: 'admin' });

    expect(await studioModel.ensureOwnStudios()).toBe(2);
    expect(await studioModel.ensureOwnStudios()).toBe(0);

    const { rows } = await pool.query(
      "SELECT count(*)::int AS n FROM users WHERE role = 'tatuador' AND studio_id IS NULL"
    );
    expect(rows[0].n).toBe(0);
  });

  test('actualiza datos, sella la baja y la borra al reactivar', async () => {
    const { studio } = await studioModel.createWithOwner({
      studio: { name: 'Antiguo', email: correoUnico('estudio') },
      owner: { name: 'Dueño', email: correoUnico('dueno'), passwordHash: 'hash' },
    });

    const renombrado = await studioModel.update(studio.id, { name: 'Nuevo', plan: 'profesional' });
    expect(renombrado).toMatchObject({ name: 'Nuevo', plan: 'profesional' });

    const baja = await studioModel.update(studio.id, { active: false });
    expect(baja.active).toBe(false);
    const { rows: sellado } = await pool.query('SELECT deactivated_at FROM studios WHERE id = $1', [studio.id]);
    expect(sellado[0].deactivated_at).not.toBeNull();

    await studioModel.update(studio.id, { active: true });
    const { rows: limpio } = await pool.query('SELECT deactivated_at FROM studios WHERE id = $1', [studio.id]);
    expect(limpio[0].deactivated_at).toBeNull();

    expect(await studioModel.update('00000000-0000-0000-0000-000000000000', { name: 'X' })).toBeNull();
    expect(await studioModel.findById('00000000-0000-0000-0000-000000000000')).toBeNull();
  });

  test('el listado del administrador suma las métricas de sus tatuadores', async () => {
    const { studio, user } = await studioModel.createWithOwner({
      studio: { name: 'Con movimiento', email: correoUnico('estudio') },
      owner: { name: 'Dueño', email: correoUnico('dueno'), passwordHash: 'hash' },
    });
    const segundo = await studioModel.addTattooist(studio.id, {
      name: 'Compañero',
      email: correoUnico('companero'),
      passwordHash: 'hash',
    });

    for (const artista of [user, segundo]) {
      const cliente = await crearCliente(artista.id);
      const proyecto = await crearProyecto(artista.id, cliente.id);
      await crearSesion(artista.id, proyecto.id);
      await crearBoceto(artista.id);
    }

    const lista = await studioModel.listWithStats();
    const fila = lista.find((s) => s.id === studio.id);
    expect(fila).toMatchObject({
      sessions_total: 2,
      upcoming_appointments: 2,
      sketches_total: 2,
      clients_total: 2,
    });
    expect(fila.tattooists.map((t) => t.name).sort()).toEqual(['Compañero', 'Dueño']);
    expect(fila.tattooists.find((t) => t.is_owner).id).toBe(user.id);
  });

  test('findOwnedBy solo responde al dueño', async () => {
    const { studio, user } = await studioModel.createWithOwner({
      studio: { name: 'Del dueño', email: correoUnico('estudio') },
      owner: { name: 'Dueño', email: correoUnico('dueno'), passwordHash: 'hash' },
    });
    const otro = await studioModel.addTattooist(studio.id, {
      name: 'Empleado',
      email: correoUnico('empleado'),
      passwordHash: 'hash',
    });

    expect((await studioModel.findOwnedBy(user.id)).id).toBe(studio.id);
    expect(await studioModel.findOwnedBy(otro.id)).toBeNull();
  });

  test('el resumen del estudio separa cobrado de pendiente por tatuador', async () => {
    const { studio, user } = await studioModel.createWithOwner({
      studio: { name: 'Resumen', email: correoUnico('estudio') },
      owner: { name: 'Dueño', email: correoUnico('dueno'), passwordHash: 'hash' },
    });

    const cliente = await crearCliente(user.id);
    const proyecto = await crearProyecto(user.id, cliente.id);
    await crearSesion(user.id, proyecto.id, { price: 70000, paid: true, status: 'completada' });
    await crearSesion(user.id, proyecto.id, {
      startsAt: new Date(Date.now() + 9 * 86400000).toISOString(),
      price: 30000,
    });

    const desde = new Date(Date.now() - 86400000).toISOString();
    const hasta = new Date(Date.now() + 30 * 86400000).toISOString();
    const filas = await studioModel.summary(studio.id, { from: desde, to: hasta });

    const fila = filas.find((f) => f.id === user.id);
    expect(fila.collected).toBe(70000);
    expect(fila.pending).toBe(30000);
    expect(fila.sessions_done).toBe(1);
    expect(fila.appointments).toBe(1);
  });
});
