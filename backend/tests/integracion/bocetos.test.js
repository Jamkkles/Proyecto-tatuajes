/**
 * Galería de bocetos, escenas 3D y recuperación de contraseña, contra la base
 * real. Lo que más interesa comprobar aquí es que las consultas filtran
 * siempre por el dueño: con dobles eso es una promesa, no una verificación.
 */
const pool = require('../../src/config/db');
const sketchModel = require('../../src/models/sketchModel');
const previewModel = require('../../src/models/previewModel');
const passwordResetModel = require('../../src/models/passwordResetModel');
const { crearArtista, crearBoceto } = require('./datos');

const AJENO = '00000000-0000-0000-0000-000000000000';

describe('sketchModel', () => {
  test('guarda el boceto con su cobertura y su paleta', async () => {
    const artista = await crearArtista();
    const boceto = await crearBoceto(artista.id, {
      title: 'Dragón',
      tags: ['japonés', 'negro'],
      inkRatio: 0.42,
      palette: [
        { hex: '#000000', share: 0.8 },
        { hex: '#aa3322', share: 0.2 },
      ],
    });

    expect(boceto.title).toBe('Dragón');
    expect(boceto.tags).toEqual(['japonés', 'negro']);
    expect(Number(boceto.ink_ratio)).toBeCloseTo(0.42);
    expect(boceto.palette).toEqual([
      { hex: '#000000', share: 0.8 },
      { hex: '#aa3322', share: 0.2 },
    ]);
    // El detalle del almacenamiento no sale en la respuesta pública.
    expect(boceto.storage_key).toBeUndefined();
  });

  test('lista solo los del artista, del más nuevo al más viejo', async () => {
    const uno = await crearArtista();
    const otro = await crearArtista();
    await crearBoceto(uno.id, { title: 'Primero' });
    await crearBoceto(uno.id, { title: 'Segundo' });
    await crearBoceto(otro.id, { title: 'De otro' });

    const mios = await sketchModel.listByUser(uno.id);
    expect(mios.map((s) => s.title)).toEqual(['Segundo', 'Primero']);
    expect(await sketchModel.listByUser(AJENO)).toEqual([]);
  });

  test('filtra por estado y por etiqueta', async () => {
    const artista = await crearArtista();
    await crearBoceto(artista.id, { title: 'Libre', status: 'disponible', tags: ['flash'] });
    await crearBoceto(artista.id, { title: 'Tomado', status: 'tatuado', tags: ['encargo'] });

    expect((await sketchModel.listByUser(artista.id, { status: 'tatuado' })).map((s) => s.title)).toEqual(['Tomado']);
    expect((await sketchModel.listByUser(artista.id, { tag: 'flash' })).map((s) => s.title)).toEqual(['Libre']);
    expect(await sketchModel.listByUser(artista.id, { tag: 'inexistente' })).toEqual([]);
  });

  test('el boceto de otro artista no se encuentra, no se edita y no se borra', async () => {
    const dueno = await crearArtista();
    const intruso = await crearArtista();
    const boceto = await crearBoceto(dueno.id);

    expect(await sketchModel.findByIdForUser(boceto.id, intruso.id)).toBeNull();
    expect(await sketchModel.update(boceto.id, intruso.id, { title: 'Robado' })).toBeNull();
    expect(await sketchModel.remove(boceto.id, intruso.id)).toBeNull();

    const sigue = await sketchModel.findByIdForUser(boceto.id, dueno.id);
    expect(sigue.title).toBe('Boceto');
    expect(sigue.storage_key).toContain('sketches/');
  });

  test('editar solo toca los campos permitidos y mueve updated_at', async () => {
    const artista = await crearArtista();
    const boceto = await crearBoceto(artista.id);

    const editado = await sketchModel.update(boceto.id, artista.id, {
      title: 'Nuevo título',
      bodyZone: 'antebrazo',
      status: 'tatuado',
    });
    expect(editado).toMatchObject({ title: 'Nuevo título', body_zone: 'antebrazo', status: 'tatuado' });
    expect(new Date(editado.updated_at).getTime()).toBeGreaterThanOrEqual(
      new Date(boceto.updated_at).getTime()
    );

    // Sin campos editables, devuelve la fila tal como está.
    const igual = await sketchModel.update(boceto.id, artista.id, {});
    expect(igual.title).toBe('Nuevo título');
  });

  test('borrar devuelve el archivo que hay que eliminar del almacenamiento', async () => {
    const artista = await crearArtista();
    const boceto = await crearBoceto(artista.id);

    const borrado = await sketchModel.remove(boceto.id, artista.id);
    expect(borrado.storage_driver).toBe('local');
    expect(borrado.storage_key).toContain(artista.id);
    expect(await sketchModel.findByIdForUser(boceto.id, artista.id)).toBeNull();
  });
});

describe('previewModel', () => {
  const escena = (sketchId) => ({
    name: 'Brazo de Ana',
    modelId: 'hombre-brazo-der-v1',
    camera: { position: [0, 1.4, 1.2], target: [0, 1.2, 0] },
    placements: [
      {
        sketchId,
        position: [0.1, 1.1, 0.05],
        quaternion: [0, 0, 0, 1],
        size: [0.08, 0.1, 0.08],
      },
    ],
  });

  test('guarda cámara y calcas como JSON y las devuelve ya convertidas', async () => {
    const artista = await crearArtista();
    const boceto = await crearBoceto(artista.id);

    const guardada = await previewModel.create({ userId: artista.id, ...escena(boceto.id) });
    expect(guardada.camera).toEqual({ position: [0, 1.4, 1.2], target: [0, 1.2, 0] });
    expect(guardada.placements).toHaveLength(1);
    expect(guardada.placements[0].sketchId).toBe(boceto.id);

    const leida = await previewModel.findByIdForUser(guardada.id, artista.id);
    expect(leida.placements[0].size).toEqual([0.08, 0.1, 0.08]);
  });

  test('la escena de otro artista no se ve ni se modifica', async () => {
    const dueno = await crearArtista();
    const intruso = await crearArtista();
    const boceto = await crearBoceto(dueno.id);
    const guardada = await previewModel.create({ userId: dueno.id, ...escena(boceto.id) });

    expect(await previewModel.findByIdForUser(guardada.id, intruso.id)).toBeNull();
    expect(await previewModel.update(guardada.id, intruso.id, { name: 'Mía' })).toBeNull();
    expect(await previewModel.remove(guardada.id, intruso.id)).toBeNull();
    expect(await previewModel.listByUser(intruso.id)).toEqual([]);
  });

  test('actualizar reemplaza las calcas enteras', async () => {
    const artista = await crearArtista();
    const boceto = await crearBoceto(artista.id);
    const guardada = await previewModel.create({ userId: artista.id, ...escena(boceto.id) });

    const sinCalcas = await previewModel.update(guardada.id, artista.id, { placements: [] });
    expect(sinCalcas.placements).toEqual([]);

    const renombrada = await previewModel.update(guardada.id, artista.id, { name: 'Otro nombre' });
    expect(renombrada.name).toBe('Otro nombre');

    const sinCambios = await previewModel.update(guardada.id, artista.id, {});
    expect(sinCambios.name).toBe('Otro nombre');
  });

  test('ownedSketchIds separa los bocetos propios de los ajenos', async () => {
    const dueno = await crearArtista();
    const otro = await crearArtista();
    const propio = await crearBoceto(dueno.id);
    const ajeno = await crearBoceto(otro.id);

    expect(await previewModel.ownedSketchIds([propio.id, ajeno.id], dueno.id)).toEqual([propio.id]);
    expect(await previewModel.ownedSketchIds([], dueno.id)).toEqual([]);
  });

  test('borrar la escena no borra el boceto', async () => {
    const artista = await crearArtista();
    const boceto = await crearBoceto(artista.id);
    const guardada = await previewModel.create({ userId: artista.id, ...escena(boceto.id) });

    expect(await previewModel.remove(guardada.id, artista.id)).toMatchObject({ id: guardada.id });
    expect(await previewModel.listByUser(artista.id)).toEqual([]);
    expect(await sketchModel.findByIdForUser(boceto.id, artista.id)).not.toBeNull();
  });
});

describe('passwordResetModel', () => {
  test('guarda el token hasheado y lo encuentra por el valor en claro', async () => {
    const artista = await crearArtista();
    const token = await passwordResetModel.create(artista.id);

    const { rows } = await pool.query('SELECT token_hash FROM password_resets WHERE user_id = $1', [
      artista.id,
    ]);
    expect(rows[0].token_hash).not.toBe(token);

    const encontrado = await passwordResetModel.findValidByToken(token);
    expect(encontrado).toMatchObject({ user_id: artista.id, email: artista.email });
  });

  test('pedir otro enlace reemplaza el anterior', async () => {
    const artista = await crearArtista();
    const primero = await passwordResetModel.create(artista.id);
    const segundo = await passwordResetModel.create(artista.id);

    expect(await passwordResetModel.findValidByToken(primero)).toBeNull();
    expect(await passwordResetModel.findValidByToken(segundo)).not.toBeNull();

    const { rows } = await pool.query('SELECT count(*)::int AS n FROM password_resets');
    expect(rows[0].n).toBe(1);
  });

  test('un token vencido ya no sirve, y usarlo lo borra', async () => {
    const artista = await crearArtista();
    const token = await passwordResetModel.create(artista.id);

    await pool.query("UPDATE password_resets SET expires_at = now() - interval '1 minute'");
    expect(await passwordResetModel.findValidByToken(token)).toBeNull();

    await passwordResetModel.deleteByUserId(artista.id);
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM password_resets');
    expect(rows[0].n).toBe(0);
  });

  test('un token inventado no encuentra nada', async () => {
    expect(await passwordResetModel.findValidByToken('token-que-no-existe')).toBeNull();
  });
});
