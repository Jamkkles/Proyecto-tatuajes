/**
 * Clientes, proyectos, citas y fotos contra la base real.
 *
 * Aquí viven las dos reglas que solo PostgreSQL puede demostrar: que dos citas
 * no se solapan aunque lleguen a la vez (el bloqueo por artista) y que los
 * resúmenes que ve el artista —promedio de puntaje, dinero cobrado, pendiente—
 * salen bien de la consulta y no de la aplicación.
 */
const pool = require('../../src/config/db');
const clientModel = require('../../src/models/clientModel');
const projectModel = require('../../src/models/projectModel');
const sessionModel = require('../../src/models/sessionModel');
const photoModel = require('../../src/models/sessionPhotoModel');
const { ConflictError } = require('../../src/utils/fields');
const { crearArtista, crearCliente, crearProyecto, crearSesion, crearBoceto, enDias } =
  require('./datos');

const AJENO = '00000000-0000-0000-0000-000000000000';

describe('clientModel', () => {
  test('un cliente recién creado trae el resumen en cero', async () => {
    const artista = await crearArtista();
    const cliente = await crearCliente(artista.id, {
      name: 'Ana',
      phone: '+56911112222',
      email: 'ana@correo.cl',
    });

    expect(cliente).toMatchObject({
      name: 'Ana',
      projects_count: 0,
      sessions_done: 0,
      no_shows: 0,
      cancellations: 0,
      rating_avg: null,
      rating_count: 0,
    });
  });

  test('el puntaje del cliente es el promedio de sus sesiones calificadas', async () => {
    const artista = await crearArtista();
    const cliente = await crearCliente(artista.id);
    const proyecto = await crearProyecto(artista.id, cliente.id);

    const una = await crearSesion(artista.id, proyecto.id, { startsAt: enDias(1) });
    const otra = await crearSesion(artista.id, proyecto.id, { startsAt: enDias(2) });
    await sessionModel.update(una.id, artista.id, { rating: 5, status: 'completada' });
    await sessionModel.update(otra.id, artista.id, { rating: 4, status: 'completada' });

    const leido = await clientModel.findByIdForUser(cliente.id, artista.id);
    expect(leido.rating_avg).toBe(4.5);
    expect(leido.rating_count).toBe(2);
    expect(leido.sessions_done).toBe(2);

    // Quitar una calificación recalcula el promedio: no hay nada guardado.
    await sessionModel.update(otra.id, artista.id, { rating: null });
    const despues = await clientModel.findByIdForUser(cliente.id, artista.id);
    expect(despues.rating_avg).toBe(5);
    expect(despues.rating_count).toBe(1);
  });

  test('la lista ordena del mejor promedio al peor y deja al final a los sin calificar', async () => {
    const artista = await crearArtista();
    const bueno = await crearCliente(artista.id, { name: 'Bueno' });
    const regular = await crearCliente(artista.id, { name: 'Regular' });
    await crearCliente(artista.id, { name: 'Sin calificar' });

    for (const [cliente, puntaje, dia] of [
      [bueno, 5, 1],
      [regular, 3, 2],
    ]) {
      const proyecto = await crearProyecto(artista.id, cliente.id);
      const sesion = await crearSesion(artista.id, proyecto.id, { startsAt: enDias(dia) });
      await sessionModel.update(sesion.id, artista.id, { rating: puntaje, status: 'completada' });
    }

    const lista = await clientModel.listByUser(artista.id);
    expect(lista.map((c) => c.name)).toEqual(['Bueno', 'Regular', 'Sin calificar']);
  });

  test('cuenta las inasistencias y las cancelaciones por separado', async () => {
    const artista = await crearArtista();
    const cliente = await crearCliente(artista.id);
    const proyecto = await crearProyecto(artista.id, cliente.id);

    const falta = await crearSesion(artista.id, proyecto.id, { startsAt: enDias(1) });
    const cancela = await crearSesion(artista.id, proyecto.id, { startsAt: enDias(2) });
    await sessionModel.update(falta.id, artista.id, { status: 'no_asistio' });
    await sessionModel.update(cancela.id, artista.id, { status: 'cancelada' });

    const leido = await clientModel.findByIdForUser(cliente.id, artista.id);
    expect(leido).toMatchObject({ no_shows: 1, cancellations: 1, sessions_done: 0 });
  });

  test('la búsqueda mira nombre y contacto, y trata el % como texto', async () => {
    const artista = await crearArtista();
    await crearCliente(artista.id, { name: 'Camila', phone: '+56999998888' });
    await crearCliente(artista.id, { name: 'Descuento 50%', instagram: '@rebajas' });

    expect((await clientModel.listByUser(artista.id, { q: 'cami' })).map((c) => c.name)).toEqual(['Camila']);
    expect((await clientModel.listByUser(artista.id, { q: '9999' })).map((c) => c.name)).toEqual(['Camila']);
    expect((await clientModel.listByUser(artista.id, { q: 'rebajas' })).map((c) => c.name)).toEqual(['Descuento 50%']);
    expect((await clientModel.listByUser(artista.id, { q: '50%' })).map((c) => c.name)).toEqual(['Descuento 50%']);
  });

  test('el cliente de otro artista no se ve, no se edita y no se borra', async () => {
    const dueno = await crearArtista();
    const intruso = await crearArtista();
    const cliente = await crearCliente(dueno.id);

    expect(await clientModel.findByIdForUser(cliente.id, intruso.id)).toBeNull();
    expect(await clientModel.update(cliente.id, intruso.id, { name: 'Robado' })).toBeNull();
    expect(await clientModel.remove(cliente.id, intruso.id)).toBeNull();
    expect(await clientModel.listByUser(intruso.id)).toEqual([]);
  });

  test('borrar un cliente se lleva sus proyectos y sus citas', async () => {
    const artista = await crearArtista();
    const cliente = await crearCliente(artista.id);
    const proyecto = await crearProyecto(artista.id, cliente.id);
    await crearSesion(artista.id, proyecto.id);

    expect(await clientModel.remove(cliente.id, artista.id)).toMatchObject({ id: cliente.id });

    const { rows } = await pool.query(
      'SELECT (SELECT count(*)::int FROM projects) AS p, (SELECT count(*)::int FROM project_sessions) AS s'
    );
    expect(rows[0]).toEqual({ p: 0, s: 0 });
  });
});

describe('projectModel', () => {
  test('no se puede colgar un proyecto del cliente de otro artista', async () => {
    const dueno = await crearArtista();
    const intruso = await crearArtista();
    const cliente = await crearCliente(dueno.id);

    expect(
      await projectModel.create({ userId: intruso.id, clientId: cliente.id, title: 'Ajeno' })
    ).toBeNull();
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM projects');
    expect(rows[0].n).toBe(0);
  });

  test('el resumen suma lo planificado y lo pagado, sin contar canceladas', async () => {
    const artista = await crearArtista();
    const cliente = await crearCliente(artista.id);
    const proyecto = await crearProyecto(artista.id, cliente.id, { totalPrice: 300000 });

    await crearSesion(artista.id, proyecto.id, { startsAt: enDias(1), price: 100000, paid: true });
    await crearSesion(artista.id, proyecto.id, { startsAt: enDias(2), price: 80000 });
    const cancelada = await crearSesion(artista.id, proyecto.id, { startsAt: enDias(3), price: 50000 });
    await sessionModel.update(cancelada.id, artista.id, { status: 'cancelada' });

    const leido = await projectModel.findByIdForUser(proyecto.id, artista.id);
    expect(leido).toMatchObject({
      sessions_count: 2,
      planned_amount: 180000,
      paid_amount: 100000,
      client_name: 'Cliente',
    });
    expect(leido.next_session_at).not.toBeNull();
  });

  test('trae el boceto enlazado y filtra por cliente y por estado', async () => {
    const artista = await crearArtista();
    const cliente = await crearCliente(artista.id);
    const otroCliente = await crearCliente(artista.id, { name: 'Otro' });
    const boceto = await crearBoceto(artista.id);

    const conBoceto = await crearProyecto(artista.id, cliente.id, {
      title: 'Con boceto',
      sketchId: boceto.id,
    });
    await crearProyecto(artista.id, otroCliente.id, { title: 'De otro cliente' });
    await projectModel.update(conBoceto.id, artista.id, { status: 'terminado' });

    expect((await projectModel.listByUser(artista.id, { clientId: cliente.id })).map((p) => p.title)).toEqual(['Con boceto']);
    expect((await projectModel.listByUser(artista.id, { status: 'terminado' })).map((p) => p.title)).toEqual(['Con boceto']);

    const leido = await projectModel.findByIdForUser(conBoceto.id, artista.id);
    expect(leido.sketch_url).toBe(boceto.url);
  });

  test('guarda las medidas que vienen de la escena 3D', async () => {
    const artista = await crearArtista();
    const cliente = await crearCliente(artista.id);
    const proyecto = await crearProyecto(artista.id, cliente.id);

    const medido = await projectModel.update(proyecto.id, artista.id, { widthCm: 12.5, heightCm: 18 });
    expect(medido.width_cm).toBeCloseTo(12.5);
    expect(medido.height_cm).toBeCloseTo(18);
  });

  test('ownsReference distingue lo propio de lo ajeno', async () => {
    const dueno = await crearArtista();
    const intruso = await crearArtista();
    const boceto = await crearBoceto(dueno.id);

    expect(await projectModel.ownsReference('sketch', boceto.id, dueno.id)).toBe(true);
    expect(await projectModel.ownsReference('sketch', boceto.id, intruso.id)).toBe(false);
    expect(await projectModel.ownsReference('preview', AJENO, dueno.id)).toBe(false);
  });

  test('el proyecto de otro artista no se toca', async () => {
    const dueno = await crearArtista();
    const intruso = await crearArtista();
    const cliente = await crearCliente(dueno.id);
    const proyecto = await crearProyecto(dueno.id, cliente.id);

    expect(await projectModel.findByIdForUser(proyecto.id, intruso.id)).toBeNull();
    expect(await projectModel.update(proyecto.id, intruso.id, { title: 'Robado' })).toBeNull();
    expect(await projectModel.remove(proyecto.id, intruso.id)).toBeNull();
  });
});

describe('sessionModel', () => {
  test('agendar una cita que se solapa es un conflicto, con nombre y hora', async () => {
    const artista = await crearArtista();
    const cliente = await crearCliente(artista.id, { name: 'Ana' });
    const proyecto = await crearProyecto(artista.id, cliente.id);
    await crearSesion(artista.id, proyecto.id, { startsAt: enDias(5, 13), durationMinutes: 120 });

    await expect(
      crearSesion(artista.id, proyecto.id, { startsAt: enDias(5, 14), durationMinutes: 60 })
    ).rejects.toThrow(ConflictError);

    await expect(
      crearSesion(artista.id, proyecto.id, { startsAt: enDias(5, 14), durationMinutes: 60 })
    ).rejects.toThrow(/Ana/);
  });

  test('dos citas seguidas no chocan', async () => {
    const artista = await crearArtista();
    const cliente = await crearCliente(artista.id);
    const proyecto = await crearProyecto(artista.id, cliente.id);

    await crearSesion(artista.id, proyecto.id, { startsAt: enDias(5, 13), durationMinutes: 120 });
    const seguida = await crearSesion(artista.id, proyecto.id, {
      startsAt: enDias(5, 15),
      durationMinutes: 60,
    });
    expect(seguida).not.toBeNull();
  });

  test('la hora de una cita cancelada vuelve a estar libre', async () => {
    const artista = await crearArtista();
    const cliente = await crearCliente(artista.id);
    const proyecto = await crearProyecto(artista.id, cliente.id);

    const primera = await crearSesion(artista.id, proyecto.id, { startsAt: enDias(5, 13) });
    await sessionModel.update(primera.id, artista.id, { status: 'cancelada' });

    const reemplazo = await crearSesion(artista.id, proyecto.id, { startsAt: enDias(5, 13) });
    expect(reemplazo).not.toBeNull();

    // Y reactivar la cancelada vuelve a chocar con la que tomó su lugar.
    await expect(
      sessionModel.update(primera.id, artista.id, { status: 'agendada' })
    ).rejects.toThrow(ConflictError);
  });

  test('cada artista tiene su propia agenda', async () => {
    const uno = await crearArtista();
    const otro = await crearArtista();
    const clienteUno = await crearCliente(uno.id);
    const clienteOtro = await crearCliente(otro.id);
    const proyectoUno = await crearProyecto(uno.id, clienteUno.id);
    const proyectoOtro = await crearProyecto(otro.id, clienteOtro.id);

    await crearSesion(uno.id, proyectoUno.id, { startsAt: enDias(5, 13) });
    const mismaHora = await crearSesion(otro.id, proyectoOtro.id, { startsAt: enDias(5, 13) });
    expect(mismaHora).not.toBeNull();
  });

  test('diez intentos simultáneos en la misma hora dejan una sola cita', async () => {
    const artista = await crearArtista();
    const cliente = await crearCliente(artista.id);
    const proyecto = await crearProyecto(artista.id, cliente.id);
    const hora = enDias(6, 10);

    const intentos = await Promise.allSettled(
      Array.from({ length: 10 }, () => crearSesion(artista.id, proyecto.id, { startsAt: hora }))
    );
    const logrados = intentos.filter((r) => r.status === 'fulfilled' && r.value);
    expect(logrados).toHaveLength(1);

    const { rows } = await pool.query('SELECT count(*)::int AS n FROM project_sessions');
    expect(rows[0].n).toBe(1);
  });

  test('editar el monto o las notas nunca se bloquea por horario', async () => {
    const artista = await crearArtista();
    const cliente = await crearCliente(artista.id);
    const proyecto = await crearProyecto(artista.id, cliente.id);
    const sesion = await crearSesion(artista.id, proyecto.id, { startsAt: enDias(5, 13) });

    // Se fuerza un solapamiento por detrás, como lo tendrían datos antiguos.
    await pool.query(
      `INSERT INTO project_sessions (user_id, project_id, starts_at, duration_minutes, price, status)
       VALUES ($1, $2, $3, 120, 10000, 'agendada')`,
      [artista.id, proyecto.id, enDias(5, 13)]
    );

    const editada = await sessionModel.update(sesion.id, artista.id, { notes: 'Trae referencia' });
    expect(editada.notes).toBe('Trae referencia');
  });

  test('la fecha de pago la pone el servidor y se conserva al reeditar', async () => {
    const artista = await crearArtista();
    const cliente = await crearCliente(artista.id);
    const proyecto = await crearProyecto(artista.id, cliente.id);
    const sesion = await crearSesion(artista.id, proyecto.id, { price: 90000 });
    expect(sesion.paid_at).toBeNull();

    const pagada = await sessionModel.update(sesion.id, artista.id, { paid: true });
    expect(pagada.paid_at).not.toBeNull();

    const otraVez = await sessionModel.update(sesion.id, artista.id, { paid: true });
    expect(new Date(otraVez.paid_at).getTime()).toBe(new Date(pagada.paid_at).getTime());

    const despagada = await sessionModel.update(sesion.id, artista.id, { paid: false });
    expect(despagada.paid_at).toBeNull();
  });

  test('el resumen de dinero separa lo cobrado de lo que falta cobrar', async () => {
    const artista = await crearArtista();
    const cliente = await crearCliente(artista.id);
    const proyecto = await crearProyecto(artista.id, cliente.id);

    const pagada = await crearSesion(artista.id, proyecto.id, { startsAt: enDias(1), price: 70000 });
    await sessionModel.update(pagada.id, artista.id, { paid: true });
    await crearSesion(artista.id, proyecto.id, { startsAt: enDias(2), price: 30000 });
    const cancelada = await crearSesion(artista.id, proyecto.id, { startsAt: enDias(3), price: 50000 });
    await sessionModel.update(cancelada.id, artista.id, { status: 'cancelada' });

    const dinero = await sessionModel.incomeByUser(artista.id, {
      from: enDias(-1),
      to: enDias(30),
    });
    expect(dinero).toEqual({ collected: 70000, pending: 30000 });
  });

  test('el calendario trae cliente y proyecto, y respeta el rango', async () => {
    const artista = await crearArtista();
    const cliente = await crearCliente(artista.id, { name: 'Ana' });
    const proyecto = await crearProyecto(artista.id, cliente.id, { title: 'Dragón' });
    await crearSesion(artista.id, proyecto.id, { startsAt: enDias(3) });
    await crearSesion(artista.id, proyecto.id, { startsAt: enDias(40) });

    const delMes = await sessionModel.listByUser(artista.id, { from: enDias(0), to: enDias(30) });
    expect(delMes).toHaveLength(1);
    expect(delMes[0]).toMatchObject({ client_name: 'Ana', project_title: 'Dragón' });
    expect(delMes[0].reminder_status).toBeNull();
  });

  test('las sesiones del proyecto vienen en orden y con sus fotos', async () => {
    const artista = await crearArtista();
    const cliente = await crearCliente(artista.id);
    const proyecto = await crearProyecto(artista.id, cliente.id);
    const primera = await crearSesion(artista.id, proyecto.id, { startsAt: enDias(2) });
    await crearSesion(artista.id, proyecto.id, { startsAt: enDias(1) });

    await photoModel.create({
      userId: artista.id,
      sessionId: primera.id,
      caption: 'Avance',
      storageDriver: 'local',
      storageKey: `sessions/${artista.id}/foto.png`,
      url: 'http://localhost:3000/uploads/foto.png',
      mimeType: 'image/png',
      sizeBytes: 2048,
      width: 800,
      height: 600,
    });

    const lista = await sessionModel.listByProject(proyecto.id, artista.id);
    expect(lista).toHaveLength(2);
    expect(new Date(lista[0].starts_at).getTime()).toBeLessThan(new Date(lista[1].starts_at).getTime());
    const conFoto = lista.find((s) => s.id === primera.id);
    expect(conFoto.photos).toHaveLength(1);
    expect(conFoto.photos[0].caption).toBe('Avance');
  });

  test('findWithClient entrega lo necesario para escribirle al cliente', async () => {
    const artista = await crearArtista();
    const cliente = await crearCliente(artista.id, { name: 'Ana', phone: '+56911112222' });
    const proyecto = await crearProyecto(artista.id, cliente.id);
    const sesion = await crearSesion(artista.id, proyecto.id);

    const conCliente = await sessionModel.findWithClient(sesion.id, artista.id);
    expect(conCliente).toMatchObject({ client_name: 'Ana', client_phone: '+56911112222' });
    expect(await sessionModel.findWithClient(sesion.id, AJENO)).toBeNull();
  });

  test('la cita de otro artista no se edita ni se borra', async () => {
    const dueno = await crearArtista();
    const intruso = await crearArtista();
    const cliente = await crearCliente(dueno.id);
    const proyecto = await crearProyecto(dueno.id, cliente.id);
    const sesion = await crearSesion(dueno.id, proyecto.id);

    expect(await sessionModel.findByIdForUser(sesion.id, intruso.id)).toBeNull();
    expect(await sessionModel.update(sesion.id, intruso.id, { price: 1 })).toBeNull();
    expect(await sessionModel.remove(sesion.id, intruso.id)).toBeNull();
  });

  test('no se puede agendar en el proyecto de otro artista', async () => {
    const dueno = await crearArtista();
    const intruso = await crearArtista();
    const cliente = await crearCliente(dueno.id);
    const proyecto = await crearProyecto(dueno.id, cliente.id);

    expect(await crearSesion(intruso.id, proyecto.id)).toBeNull();
  });
});

describe('sessionPhotoModel', () => {
  const foto = (artista, sesion, extra = {}) => ({
    userId: artista,
    sessionId: sesion,
    caption: 'Avance',
    storageDriver: 'local',
    storageKey: `sessions/${artista}/${Math.random().toString(36).slice(2)}.png`,
    url: 'http://localhost:3000/uploads/foto.png',
    mimeType: 'image/png',
    sizeBytes: 2048,
    width: 800,
    height: 600,
    ...extra,
  });

  test('no se puede subir una foto a la sesión de otro artista', async () => {
    const dueno = await crearArtista();
    const intruso = await crearArtista();
    const cliente = await crearCliente(dueno.id);
    const proyecto = await crearProyecto(dueno.id, cliente.id);
    const sesion = await crearSesion(dueno.id, proyecto.id);

    expect(await photoModel.create(foto(intruso.id, sesion.id))).toBeNull();
  });

  test('borrar devuelve el archivo, y no borra la foto de otro', async () => {
    const dueno = await crearArtista();
    const intruso = await crearArtista();
    const cliente = await crearCliente(dueno.id);
    const proyecto = await crearProyecto(dueno.id, cliente.id);
    const sesion = await crearSesion(dueno.id, proyecto.id);
    const guardada = await photoModel.create(foto(dueno.id, sesion.id));

    expect(await photoModel.remove(guardada.id, sesion.id, intruso.id)).toBeNull();
    const borrada = await photoModel.remove(guardada.id, sesion.id, dueno.id);
    expect(borrada.storage_key).toContain('sessions/');
  });

  test('filesFor junta los archivos del cliente, del proyecto y de la sesión', async () => {
    const artista = await crearArtista();
    const cliente = await crearCliente(artista.id);
    const proyecto = await crearProyecto(artista.id, cliente.id);
    const una = await crearSesion(artista.id, proyecto.id, { startsAt: enDias(1) });
    const otra = await crearSesion(artista.id, proyecto.id, { startsAt: enDias(2) });
    await photoModel.create(foto(artista.id, una.id));
    await photoModel.create(foto(artista.id, otra.id));

    expect(await photoModel.filesFor('session', una.id, artista.id)).toHaveLength(1);
    expect(await photoModel.filesFor('project', proyecto.id, artista.id)).toHaveLength(2);
    expect(await photoModel.filesFor('client', cliente.id, artista.id)).toHaveLength(2);
    expect(await photoModel.filesFor('client', cliente.id, AJENO)).toHaveLength(0);
  });
});
