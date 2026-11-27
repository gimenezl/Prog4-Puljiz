import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, describe, test } from 'node:test';
import { setTimeout as esperar } from 'node:timers/promises';

import { aplicarMigraciones } from '../../../scripts/migrate.js';
import { composeApplication } from '../../../src/composition-root.js';
import { ErrorDeDominio } from '../../../src/domain/errors/error-de-dominio.js';
import { UbicacionChofer } from '../../../src/domain/entities/ubicacion-chofer.js';
import { ROLES, Usuario } from '../../../src/domain/entities/usuario.js';
import { Vehiculo } from '../../../src/domain/entities/vehiculo.js';
import { loadEnv } from '../../../src/infrastructure/config/env.js';
import { detenerServidor, iniciarServidor } from '../../helpers/http-server.js';
import { crearKitPostgres } from '../../helpers/postgres-kit.js';
import { DESTINO, ORIGEN } from '../../helpers/viajes-kit.js';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const describirPostgres = TEST_DATABASE_URL ? describe : describe.skip;

function diferido() {
  let resolver;
  const promesa = new Promise((resolucion) => {
    resolver = resolucion;
  });

  return { promesa, resolver };
}

async function insertarViajeCrudo(
  kit,
  {
    id = randomUUID(),
    pasajeroId,
    estado = 'SOLICITADO',
    choferId = null,
    distanciaEstimadaM = 1200,
    precioFijadoCentavos = 150000,
    asignadoEn = null,
    iniciadoEn = null,
    cerradoEn = null,
    canceladoPorId = null,
    motivoCancelacion = null,
  } = {},
) {
  await kit.baseDeDatos.query(
    `INSERT INTO viajes (
       id, pasajero_id, origen_lat, origen_lng, destino_lat, destino_lng,
       distancia_estimada_m, precio_fijado_centavos, chofer_id, estado, solicitado_en,
       asignado_en, iniciado_en, cerrado_en, cancelado_por_id, motivo_cancelacion
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
    [
      id,
      pasajeroId,
      ORIGEN.lat,
      ORIGEN.lng,
      DESTINO.lat,
      DESTINO.lng,
      distanciaEstimadaM,
      precioFijadoCentavos,
      choferId,
      estado,
      new Date(),
      asignadoEn,
      iniciadoEn,
      cerradoEn,
      canceladoPorId,
      motivoCancelacion,
    ],
  );

  return id;
}

async function llamarHttp(url, { method = 'GET', token, body, headers = {} } = {}) {
  const cabeceras = { ...headers };

  if (body !== undefined) cabeceras['content-type'] = 'application/json';
  if (token) cabeceras.authorization = `Bearer ${token}`;

  const respuesta = await fetch(url, {
    method,
    headers: cabeceras,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const texto = await respuesta.text();

  return {
    respuesta,
    cuerpo: texto.length > 0 ? JSON.parse(texto) : null,
  };
}

async function iniciarSesionHttp(urlBase, email, contrasena) {
  const sesion = await llamarHttp(`${urlBase}/auth/login`, {
    method: 'POST',
    body: { email, contrasena },
  });

  assert.equal(sesion.respuesta.status, 200);
  return sesion.cuerpo;
}

async function crearCuentaHttp(urlBase, { email, nombre, rol }) {
  const registro = await llamarHttp(`${urlBase}/auth/registro`, {
    method: 'POST',
    body: { email, nombre, contrasena: 'Segura123', rol },
  });

  assert.equal(registro.respuesta.status, 201);
  return iniciarSesionHttp(urlBase, email, 'Segura123');
}

describirPostgres('PostgreSQL real con compose.test.yaml', () => {
  let kit;

  before(async () => {
    kit = crearKitPostgres();
    await aplicarMigraciones(kit.baseDeDatos);
  });

  after(async () => {
    await kit?.cerrar();
  });

  beforeEach(async () => {
    await kit.limpiar();
  });

  test('las migraciones son idempotentes y crean el esquema esperado', async () => {
    await aplicarMigraciones(kit.baseDeDatos);

    const tablas = await kit.baseDeDatos.query(
      `SELECT table_name
         FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
          AND table_name <> 'spatial_ref_sys' -- la crea la extensión PostGIS
        ORDER BY table_name`,
    );

    const postgis = await kit.baseDeDatos.query(
      `SELECT extversion FROM pg_extension WHERE extname = 'postgis'`,
    );
    assert.equal(postgis.rows.length, 1, 'falta la extensión PostGIS');

    assert.deepEqual(
      tablas.rows.map((fila) => fila.table_name),
      [
        'choferes',
        'claves_idempotencia',
        'cobros_simulados',
        'cotizaciones',
        'reglas_multiplicador',
        'tarifas',
        'ubicaciones_vigentes',
        'usuarios',
        'vehiculos',
        'viajes',
        'zonas_de_demanda',
      ],
    );

    const indices = await kit.baseDeDatos.query(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`,
    );
    const nombres = new Set(indices.rows.map((fila) => fila.indexname));

    for (const indice of [
      'usuarios_email_lower_idx',
      'viajes_chofer_activo_idx',
      'claves_idempotencia_vence_en_idx',
      'cobros_simulados_estado_idx',
      'ubicaciones_vigentes_posicion_idx',
      'zonas_de_demanda_nombre_lower_idx',
      'zonas_de_demanda_area_idx',
      'tarifas_version_publicada_idx',
      'tarifas_publicadas_vigencia_idx',
      'reglas_multiplicador_version_publicada_idx',
      'reglas_multiplicador_publicadas_vigencia_idx',
      'cotizaciones_pasajero_id_idx',
      'cotizaciones_zona_calculada_idx',
      'cotizaciones_estado_vence_idx',
    ]) {
      assert.equal(nombres.has(indice), true, `falta el índice ${indice}`);
    }

    const columnaInicio = await kit.baseDeDatos.query(
      `SELECT data_type, is_nullable
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'viajes'
          AND column_name = 'iniciado_en'`,
    );
    assert.deepEqual(columnaInicio.rows, [
      { data_type: 'timestamp with time zone', is_nullable: 'YES' },
    ]);

    const restricciones = await kit.baseDeDatos.query(
      `SELECT conname
         FROM pg_constraint
        WHERE conrelid = 'viajes'::regclass AND contype = 'c'`,
    );
    const nombresRestricciones = new Set(restricciones.rows.map((fila) => fila.conname));

    for (const restriccion of [
      'viajes_estado_check',
      'viajes_chofer_coherente_check',
      'viajes_cancelacion_check',
      'viajes_iniciado_check',
      'viajes_cierre_check',
      'viajes_cancelacion_autor_check',
      'viajes_cancelado_por_chofer_check',
    ]) {
      assert.equal(
        nombresRestricciones.has(restriccion),
        true,
        `falta la restricción ${restriccion}`,
      );
    }
  });

  test('aplicar dos veces las migraciones conserva los checks de la migración 013', async () => {
    await aplicarMigraciones(kit.baseDeDatos);
    await aplicarMigraciones(kit.baseDeDatos);

    const restricciones = await kit.baseDeDatos.query(
      `SELECT conname
         FROM pg_constraint
        WHERE conrelid = 'viajes'::regclass AND contype = 'c'`,
    );
    const nombres = restricciones.rows.map((fila) => fila.conname);

    for (const restriccion of [
      'viajes_iniciado_check',
      'viajes_cierre_check',
      'viajes_cancelacion_autor_check',
      'viajes_cancelado_por_chofer_check',
    ]) {
      assert.equal(
        nombres.filter((nombre) => nombre === restriccion).length,
        1,
        `la restricción ${restriccion} debe existir una sola vez tras reaplicar las migraciones`,
      );
    }
  });

  test('los repositorios persisten y recuperan usuarios, choferes, viajes y claves', async () => {
    const pasajero = await kit.crearUsuario({
      email: 'Pasajero.Roundtrip@Example.com',
      nombre: 'Pasajero Roundtrip',
    });

    const porEmail = await kit.repositorioUsuarios.buscarPorEmail('PASAJERO.ROUNDTRIP@EXAMPLE.COM');
    assert.equal(porEmail?.id, pasajero.id);

    const { usuario: usuarioChofer, perfil } = await kit.crearChofer();
    const creado = await kit.crearViaje({
      pasajeroId: pasajero.id,
      origen: ORIGEN,
      destino: DESTINO,
      claveIdempotencia: 'roundtrip',
    });
    assert.equal(creado.reutilizada, false);

    const leido = await kit.repositorioViajes.buscarPorId(creado.viaje.id);
    assert.equal(leido.pasajeroId, pasajero.id);
    assert.equal(leido.estado, 'SOLICITADO');
    assert.equal(leido.choferId, null);
    assert.equal(leido.distanciaEstimadaM, creado.viaje.distanciaEstimadaM);
    assert.equal(leido.precioFijadoCentavos, creado.viaje.precioFijadoCentavos);
    assert.equal(leido.solicitadoEn.toISOString(), creado.viaje.solicitadoEn);

    const solicitados = await kit.repositorioViajes.listarSolicitados();
    assert.deepEqual(
      solicitados.map((viaje) => viaje.id),
      [creado.viaje.id],
    );

    const perfilLeido = await kit.repositorioChoferes.buscarPorUsuarioId(usuarioChofer.id);
    assert.equal(perfilLeido.habilitado, true);
    assert.equal(perfilLeido.disponible, true);

    await kit.repositorioChoferes.actualizar(perfil.conDisponibilidad(false));
    const perfilActualizado = await kit.repositorioChoferes.buscarPorUsuarioId(usuarioChofer.id);
    assert.equal(perfilActualizado.disponible, false);

    const registro = await kit.repositorioClavesIdempotencia.buscar(
      `viaje:crear:${pasajero.id}`,
      'roundtrip',
    );
    assert.equal(registro.respuesta.viaje.id, creado.viaje.id);
    assert.equal(registro.venceEn instanceof Date, true);
    assert.equal(registro.venceEn.getTime() > registro.creadaEn.getTime(), true);

    const duplicada = await kit.repositorioClavesIdempotencia.crear(registro);
    assert.equal(duplicada, false);
  });

  test('el repositorio recupera iniciadoEn como Date tras aceptar, ir en camino e iniciar', async () => {
    const { viaje, chofer } = await kit.crearViajeAsignado();

    const asignado = await kit.repositorioViajes.buscarPorId(viaje.id);
    assert.equal(asignado.estado, 'ASIGNADO');
    assert.equal(asignado.iniciadoEn, null);

    await kit.marcarEnCamino({ viajeId: viaje.id, choferId: chofer.usuario.id });
    const enCamino = await kit.repositorioViajes.buscarPorId(viaje.id);
    assert.equal(enCamino.estado, 'CHOFER_EN_CAMINO');
    assert.equal(enCamino.iniciadoEn, null);

    const iniciado = await kit.iniciarViaje({ viajeId: viaje.id, choferId: chofer.usuario.id });
    const leido = await kit.repositorioViajes.buscarPorId(viaje.id);

    assert.equal(leido.estado, 'EN_CURSO');
    assert.equal(leido.iniciadoEn instanceof Date, true);
    assert.equal(leido.iniciadoEn.toISOString(), iniciado.iniciadoEn.toISOString());
  });

  test('el repositorio de vehículos guarda, reemplaza y rechaza patentes duplicadas', async () => {
    const { usuario: chofer } = await kit.crearChofer();
    const { usuario: otroChofer } = await kit.crearChofer();

    const vehiculo = new Vehiculo({
      id: randomUUID(),
      choferId: chofer.id,
      patente: 'AB123CD',
      marca: 'Toyota',
      modelo: 'Etios',
      anio: 2021,
    });
    await kit.repositorioVehiculos.guardar(vehiculo);

    const leido = await kit.repositorioVehiculos.buscarPorChoferId(chofer.id);
    assert.deepEqual(leido.aVistaPublica(), vehiculo.aVistaPublica());

    // Guardar otra vez para el mismo chofer reemplaza los datos y conserva el id.
    await kit.repositorioVehiculos.guardar(
      vehiculo.conDatos({ patente: 'ABC123', marca: 'Fiat', modelo: 'Cronos' }),
    );
    const editado = await kit.repositorioVehiculos.buscarPorChoferId(chofer.id);
    assert.equal(editado.id, vehiculo.id);
    assert.equal(editado.patente, 'ABC123');
    assert.equal(editado.anio, null);

    await assert.rejects(
      () =>
        kit.repositorioVehiculos.guardar(
          new Vehiculo({
            id: randomUUID(),
            choferId: otroChofer.id,
            patente: 'ABC123',
            marca: 'Ford',
            modelo: 'Ka',
          }),
        ),
      (error) => error.codigo === 'PATENTE_YA_REGISTRADA',
    );

    assert.equal(await kit.repositorioVehiculos.buscarPorChoferId(otroChofer.id), null);
  });

  test('el repositorio de ubicaciones guarda puntos PostGIS y no retrocede', async () => {
    const { usuario: chofer } = await kit.crearChofer();
    const ubicacion = (punto, iso) =>
      new UbicacionChofer({ choferId: chofer.id, punto, actualizadaEn: new Date(iso) });

    const obelisco = { lat: -34.6037, lng: -58.3816 };
    // El kit crea al chofer con una ubicación en `ahora`; estos envíos deben ser
    // posteriores para que la primera escritura reemplace esa ubicación.
    const base = Date.now() + 60 * 60 * 1000;
    const instante = (desplazamientoMs) => new Date(base + desplazamientoMs).toISOString();
    await kit.repositorioUbicaciones.guardar(ubicacion(obelisco, instante(0)));

    const leida = await kit.repositorioUbicaciones.buscarPorChoferId(chofer.id);
    assert.deepEqual(leida.punto.aJSON(), obelisco);
    assert.equal(leida.actualizadaEn.toISOString(), instante(0));

    // Un envío más nuevo reemplaza; uno más viejo no.
    const palermo = { lat: -34.5889, lng: -58.4306 };
    await kit.repositorioUbicaciones.guardar(ubicacion(palermo, instante(2_000)));
    await kit.repositorioUbicaciones.guardar(ubicacion(obelisco, instante(1_000)));
    assert.deepEqual(
      (await kit.repositorioUbicaciones.buscarPorChoferId(chofer.id)).punto.aJSON(),
      palermo,
    );

    // PostGIS calcula distancias reales en metros: Obelisco-Palermo son ~4,8 km.
    const { rows } = await kit.baseDeDatos.query(
      `SELECT ST_Distance(posicion, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography) AS metros,
              ST_DWithin(posicion, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, 3000) AS a_3km,
              ST_DWithin(posicion, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, 6000) AS a_6km
         FROM ubicaciones_vigentes WHERE chofer_id = $1`,
      [chofer.id, obelisco.lng, obelisco.lat],
    );
    assert.equal(Math.round(rows[0].metros / 100) * 100, 4800);
    assert.equal(rows[0].a_3km, false);
    assert.equal(rows[0].a_6km, true);
  });

  test('las restricciones de la base rechazan datos incoherentes y duplicados', async () => {
    const { usuario: chofer } = await kit.crearChofer({
      habilitado: false,
      disponible: false,
    });

    await assert.rejects(
      () =>
        kit.baseDeDatos.query('UPDATE choferes SET disponible = true WHERE usuario_id = $1', [
          chofer.id,
        ]),
      (error) => error.code === '23514',
    );

    const pasajero = await kit.crearUsuario();

    await assert.rejects(
      () => insertarViajeCrudo(kit, { pasajeroId: pasajero.id, estado: 'ESTADO_INVALIDO' }),
      (error) => error.code === '23514',
    );

    await assert.rejects(
      () =>
        insertarViajeCrudo(kit, {
          pasajeroId: pasajero.id,
          estado: 'ASIGNADO',
          choferId: null,
        }),
      (error) => error.code === '23514',
    );

    await assert.rejects(
      () => insertarViajeCrudo(kit, { pasajeroId: randomUUID() }),
      (error) => error.code === '23503',
    );

    const ahora = new Date();

    await assert.rejects(
      () =>
        insertarViajeCrudo(kit, {
          pasajeroId: pasajero.id,
          estado: 'EN_CURSO',
          choferId: chofer.id,
          asignadoEn: ahora,
        }),
      (error) => error.code === '23514',
    );

    await assert.rejects(
      () =>
        insertarViajeCrudo(kit, {
          pasajeroId: pasajero.id,
          estado: 'ASIGNADO',
          choferId: chofer.id,
          asignadoEn: ahora,
          iniciadoEn: ahora,
        }),
      (error) => error.code === '23514',
    );

    await assert.rejects(
      () =>
        insertarViajeCrudo(kit, {
          pasajeroId: pasajero.id,
          estado: 'FINALIZADO',
          choferId: chofer.id,
          asignadoEn: ahora,
          iniciadoEn: ahora,
        }),
      (error) => error.code === '23514',
    );

    await assert.rejects(
      () =>
        insertarViajeCrudo(kit, {
          pasajeroId: pasajero.id,
          estado: 'CANCELADO_POR_CHOFER',
          choferId: null,
          cerradoEn: ahora,
          canceladoPorId: chofer.id,
          motivoCancelacion: 'Sin chofer asociado',
        }),
      (error) => error.code === '23514',
    );

    await assert.rejects(
      () =>
        insertarViajeCrudo(kit, {
          pasajeroId: pasajero.id,
          estado: 'CANCELADO_POR_PASAJERO',
          cerradoEn: ahora,
          motivoCancelacion: 'Sin autor',
        }),
      (error) => error.code === '23514',
    );

    const enCurso = await insertarViajeCrudo(kit, {
      pasajeroId: pasajero.id,
      estado: 'EN_CURSO',
      choferId: chofer.id,
      asignadoEn: ahora,
      iniciadoEn: ahora,
    });

    await kit.baseDeDatos.query(
      `UPDATE viajes SET estado = 'FINALIZADO', cerrado_en = NOW() WHERE id = $1`,
      [enCurso],
    );

    const primerViaje = await insertarViajeCrudo(kit, { pasajeroId: pasajero.id });
    const segundoViaje = await insertarViajeCrudo(kit, { pasajeroId: pasajero.id });

    await kit.baseDeDatos.query(
      `UPDATE viajes
          SET estado = 'ASIGNADO', chofer_id = $2, asignado_en = NOW()
        WHERE id = $1`,
      [primerViaje, chofer.id],
    );

    await assert.rejects(
      () =>
        kit.baseDeDatos.query(
          `UPDATE viajes
              SET estado = 'ASIGNADO', chofer_id = $2, asignado_en = NOW()
            WHERE id = $1`,
          [segundoViaje, chofer.id],
        ),
      (error) => error.code === '23505',
    );

    await assert.rejects(
      () =>
        kit.repositorioUsuarios.crear(
          new Usuario({
            id: randomUUID(),
            email: pasajero.email.toUpperCase(),
            nombre: 'Duplicado',
            credencial: 'credencial',
            rol: ROLES.PASAJERO,
            creadoEn: new Date(),
          }),
        ),
      (error) => error instanceof ErrorDeDominio && error.codigo === 'EMAIL_YA_REGISTRADO',
    );
  });

  test('la base rechaza motivos de cancelación mayores a 500 caracteres', async () => {
    const pasajero = await kit.crearUsuario();

    // La migración 002 impone VARCHAR(500) y exige motivo no nulo en los
    // estados cancelados; no define un CHECK de motivo no vacío (eso lo
    // valida el dominio). Sí rechaza el desbordamiento de longitud.
    await assert.rejects(
      () =>
        insertarViajeCrudo(kit, {
          pasajeroId: pasajero.id,
          estado: 'CANCELADO_POR_PASAJERO',
          cerradoEn: new Date(),
          canceladoPorId: pasajero.id,
          motivoCancelacion: 'x'.repeat(501),
        }),
      (error) => error.code === '22001',
    );

    const rechazados = await kit.baseDeDatos.query(
      'SELECT COUNT(*)::int AS total FROM viajes WHERE pasajero_id = $1',
      [pasajero.id],
    );
    assert.equal(rechazados.rows[0].total, 0);

    const limite = await insertarViajeCrudo(kit, {
      pasajeroId: pasajero.id,
      estado: 'CANCELADO_POR_PASAJERO',
      cerradoEn: new Date(),
      canceladoPorId: pasajero.id,
      motivoCancelacion: 'y'.repeat(500),
    });
    const guardado = await kit.baseDeDatos.query(
      'SELECT motivo_cancelacion FROM viajes WHERE id = $1',
      [limite],
    );
    assert.equal(guardado.rows[0].motivo_cancelacion.length, 500);
  });

  test('SELECT FOR UPDATE bloquea la fila del viaje hasta el commit', async () => {
    const { viaje } = await kit.crearViajeDePrueba();
    const bloqueoAdquirido = diferido();
    const liberarBloqueo = diferido();

    const transaccionA = kit.unidadDeTrabajo.ejecutar(async (tx) => {
      await kit.repositorioViajes.buscarPorIdParaActualizar(viaje.id, tx);
      bloqueoAdquirido.resolver();
      await liberarBloqueo.promesa;
      return 'A';
    });

    await bloqueoAdquirido.promesa;

    let resueltaB = false;
    const transaccionB = kit.unidadDeTrabajo.ejecutar(async (tx) => {
      const fila = await kit.repositorioViajes.buscarPorIdParaActualizar(viaje.id, tx);
      resueltaB = true;
      return fila.id;
    });

    let resultados;

    try {
      await esperar(200);
      assert.equal(resueltaB, false);
    } finally {
      liberarBloqueo.resolver();
      resultados = await Promise.all([transaccionA, transaccionB]);
    }

    assert.equal(resultados[0], 'A');
    assert.equal(resultados[1], viaje.id);
  });

  test('la unidad de trabajo revierte todos los cambios si la operación falla', async () => {
    const { usuario, perfil } = await kit.crearChofer({ disponible: true });

    await assert.rejects(
      () =>
        kit.unidadDeTrabajo.ejecutar(async (tx) => {
          await kit.repositorioChoferes.actualizar(perfil.conDisponibilidad(false), tx);
          throw new Error('falla intencional');
        }),
      /falla intencional/,
    );

    const leido = await kit.repositorioChoferes.buscarPorUsuarioId(usuario.id);
    assert.equal(leido.disponible, true);
  });

  test('50 aceptaciones concurrentes: exactamente un chofer gana', async () => {
    const { viaje } = await kit.crearViajeDePrueba();
    const choferes = await Promise.all(Array.from({ length: 50 }, () => kit.crearChofer()));

    const resultados = await Promise.allSettled(
      choferes.map(({ usuario }) => kit.aceptarViaje({ viajeId: viaje.id, choferId: usuario.id })),
    );

    const exitos = resultados.filter((resultado) => resultado.status === 'fulfilled');
    const fallos = resultados.filter((resultado) => resultado.status === 'rejected');

    assert.equal(exitos.length, 1);
    assert.equal(fallos.length, 49);

    for (const fallo of fallos) {
      assert.equal(fallo.reason instanceof ErrorDeDominio, true);
      assert.equal(fallo.reason.codigo, 'VIAJE_NO_DISPONIBLE');
    }

    const ganadorId = exitos[0].value.choferId;
    const fila = await kit.baseDeDatos.query('SELECT estado, chofer_id FROM viajes WHERE id = $1', [
      viaje.id,
    ]);
    assert.equal(fila.rows[0].estado, 'ASIGNADO');
    assert.equal(fila.rows[0].chofer_id, ganadorId);

    const activos = await kit.baseDeDatos.query(
      'SELECT usuario_id FROM choferes WHERE viaje_activo_id = $1',
      [viaje.id],
    );
    assert.deepEqual(
      activos.rows.map((filaChofer) => filaChofer.usuario_id),
      [ganadorId],
    );
  });

  test('un chofer no puede aceptar dos viajes a la vez', async () => {
    const { usuario } = await kit.crearChofer();
    const primerViaje = await kit.crearViajeDePrueba();
    const segundoViaje = await kit.crearViajeDePrueba();

    const resultados = await Promise.allSettled([
      kit.aceptarViaje({ viajeId: primerViaje.viaje.id, choferId: usuario.id }),
      kit.aceptarViaje({ viajeId: segundoViaje.viaje.id, choferId: usuario.id }),
    ]);

    const exitos = resultados.filter((resultado) => resultado.status === 'fulfilled');
    const fallos = resultados.filter((resultado) => resultado.status === 'rejected');

    assert.equal(exitos.length, 1);
    assert.equal(fallos.length, 1);
    assert.equal(fallos[0].reason.codigo, 'CHOFER_OCUPADO');

    const ganador = exitos[0].value;
    const perdedorId =
      ganador.id === primerViaje.viaje.id ? segundoViaje.viaje.id : primerViaje.viaje.id;

    const perdedor = await kit.repositorioViajes.buscarPorId(perdedorId);
    assert.equal(perdedor.estado, 'SOLICITADO');

    const perfil = await kit.repositorioChoferes.buscarPorUsuarioId(usuario.id);
    assert.equal(perfil.viajeActivoId, ganador.id);
  });

  test('la misma clave concurrente crea un solo viaje y un solo registro', async () => {
    const pasajero = await kit.crearUsuario();
    const claveIdempotencia = 'concurrente-postgres';
    const solicitudes = Array.from({ length: 8 }, () =>
      kit.crearViaje({
        pasajeroId: pasajero.id,
        origen: ORIGEN,
        destino: DESTINO,
        claveIdempotencia,
      }),
    );

    const resultados = await Promise.all(solicitudes);
    const creadores = resultados.filter((resultado) => resultado.reutilizada === false);

    assert.equal(creadores.length, 1);
    assert.equal(new Set(resultados.map((resultado) => resultado.viaje.id)).size, 1);

    const viajeId = creadores[0].viaje.id;
    const viajes = await kit.baseDeDatos.query('SELECT COUNT(*)::int AS total FROM viajes');
    assert.equal(viajes.rows[0].total, 1);

    const claves = await kit.baseDeDatos.query(
      'SELECT COUNT(*)::int AS total FROM claves_idempotencia',
    );
    assert.equal(claves.rows[0].total, 1);

    await assert.rejects(
      () =>
        kit.crearViaje({
          pasajeroId: pasajero.id,
          origen: ORIGEN,
          destino: { lat: -34.62, lng: -58.4 },
          claveIdempotencia,
        }),
      (error) => error.codigo === 'CLAVE_REUTILIZADA_CON_OTRO_CONTENIDO',
    );

    await kit.baseDeDatos.query(
      `UPDATE claves_idempotencia
          SET vence_en = NOW() - INTERVAL '1 second'
        WHERE alcance = $1 AND clave = $2`,
      [`viaje:crear:${pasajero.id}`, claveIdempotencia],
    );

    const nuevo = await kit.crearViaje({
      pasajeroId: pasajero.id,
      origen: ORIGEN,
      destino: DESTINO,
      claveIdempotencia,
    });

    assert.equal(nuevo.reutilizada, false);
    assert.notEqual(nuevo.viaje.id, viajeId);
  });

  test('finalizar y cobrar persiste viaje, cobro, chofer e idempotencia en una sola transacción', async () => {
    const { viaje, chofer, pasajero } = await kit.crearViajeEnCurso();
    const claveIdempotencia = 'finalizar-postgres';

    const resultado = await kit.finalizarViaje({
      viajeId: viaje.id,
      choferId: chofer.usuario.id,
      claveIdempotencia,
    });

    assert.equal(resultado.reutilizada, false);
    assert.equal(resultado.viaje.estado, 'FINALIZADO');
    assert.equal(resultado.cobro.estado, 'COBRADO');
    assert.equal(resultado.cobro.montoCentavos, viaje.precioFijadoCentavos);
    assert.equal(resultado.cobro.referencia, `SIM-${viaje.id}`);

    const filaViaje = await kit.baseDeDatos.query(
      'SELECT estado, iniciado_en, cerrado_en FROM viajes WHERE id = $1',
      [viaje.id],
    );
    assert.equal(filaViaje.rows[0].estado, 'FINALIZADO');
    assert.notEqual(filaViaje.rows[0].iniciado_en, null);
    assert.notEqual(filaViaje.rows[0].cerrado_en, null);

    const filaCobro = await kit.baseDeDatos.query(
      `SELECT viaje_id, monto_centavos, estado, referencia
         FROM cobros_simulados
        WHERE viaje_id = $1`,
      [viaje.id],
    );
    assert.equal(filaCobro.rowCount, 1);
    assert.equal(filaCobro.rows[0].monto_centavos, viaje.precioFijadoCentavos);
    assert.equal(filaCobro.rows[0].estado, 'COBRADO');
    assert.equal(filaCobro.rows[0].referencia, `SIM-${viaje.id}`);

    const perfil = await kit.repositorioChoferes.buscarPorUsuarioId(chofer.usuario.id);
    assert.equal(perfil.viajeActivoId, null);
    assert.equal(perfil.estado, 'DISPONIBLE');

    const clave = await kit.repositorioClavesIdempotencia.buscar(
      `viaje:finalizar:${chofer.usuario.id}`,
      claveIdempotencia,
    );
    assert.equal(clave.respuesta.cobro.id, resultado.cobro.id);

    const cobroConsultado = await kit.obtenerCobro({
      viajeId: viaje.id,
      solicitante: { usuarioId: pasajero.id, rol: ROLES.PASAJERO },
    });
    assert.equal(cobroConsultado.id, resultado.cobro.id);

    const reintento = await kit.finalizarViaje({
      viajeId: viaje.id,
      choferId: chofer.usuario.id,
      claveIdempotencia,
    });
    assert.equal(reintento.reutilizada, true);
    assert.equal(reintento.cobro.id, resultado.cobro.id);

    await assert.rejects(
      () =>
        kit.baseDeDatos.query(
          `INSERT INTO cobros_simulados (
             id, viaje_id, monto_centavos, estado, creado_en
           ) VALUES ($1, $2, $3, 'PENDIENTE', NOW())`,
          [randomUUID(), viaje.id, viaje.precioFijadoCentavos],
        ),
      (error) => error.code === '23505',
    );
  });

  test('8 finalizaciones concurrentes con la misma clave generan un solo cobro', async () => {
    const { viaje, chofer } = await kit.crearViajeEnCurso();
    const claveIdempotencia = 'finalizar-concurrente';

    const resultados = await Promise.all(
      Array.from({ length: 8 }, () =>
        kit.finalizarViaje({
          viajeId: viaje.id,
          choferId: chofer.usuario.id,
          claveIdempotencia,
        }),
      ),
    );

    assert.equal(resultados.filter((resultado) => resultado.reutilizada === false).length, 1);
    assert.equal(new Set(resultados.map((resultado) => resultado.cobro.id)).size, 1);

    const cobros = await kit.baseDeDatos.query(
      'SELECT COUNT(*)::int AS total FROM cobros_simulados WHERE viaje_id = $1',
      [viaje.id],
    );
    assert.equal(cobros.rows[0].total, 1);

    const claves = await kit.baseDeDatos.query(
      `SELECT COUNT(*)::int AS total
         FROM claves_idempotencia
        WHERE alcance = $1 AND clave = $2`,
      [`viaje:finalizar:${chofer.usuario.id}`, claveIdempotencia],
    );
    assert.equal(claves.rows[0].total, 1);
  });

  test('finalizaciones concurrentes con claves distintas generan un solo cobro', async () => {
    const { viaje, chofer } = await kit.crearViajeEnCurso();

    const resultados = await Promise.allSettled(
      Array.from({ length: 6 }, (_, indice) =>
        kit.finalizarViaje({
          viajeId: viaje.id,
          choferId: chofer.usuario.id,
          claveIdempotencia: `carrera-${indice}`,
        }),
      ),
    );

    const exitosos = resultados.filter((resultado) => resultado.status === 'fulfilled');
    const rechazados = resultados.filter((resultado) => resultado.status === 'rejected');

    assert.equal(exitosos.length, 1);
    assert.equal(rechazados.length, 5);

    for (const rechazo of rechazados) {
      assert.equal(rechazo.reason.codigo, 'TRANSICION_INVALIDA');
    }

    const cobros = await kit.baseDeDatos.query(
      'SELECT COUNT(*)::int AS total FROM cobros_simulados WHERE viaje_id = $1',
      [viaje.id],
    );
    assert.equal(cobros.rows[0].total, 1);
  });

  test('una clave reutilizada con otro viaje no cobra el segundo viaje', async () => {
    const primero = await kit.crearViajeEnCurso();
    const claveIdempotencia = 'clave-entre-viajes';

    await kit.finalizarViaje({
      viajeId: primero.viaje.id,
      choferId: primero.chofer.usuario.id,
      claveIdempotencia,
    });

    const segundo = await kit.crearViajeEnCurso({ chofer: primero.chofer });

    await assert.rejects(
      () =>
        kit.finalizarViaje({
          viajeId: segundo.viaje.id,
          choferId: primero.chofer.usuario.id,
          claveIdempotencia,
        }),
      (error) => error.codigo === 'CLAVE_REUTILIZADA_CON_OTRO_CONTENIDO',
    );

    const viaje = await kit.repositorioViajes.buscarPorId(segundo.viaje.id);
    assert.equal(viaje.estado, 'EN_CURSO');

    const cobros = await kit.baseDeDatos.query(
      'SELECT COUNT(*)::int AS total FROM cobros_simulados WHERE viaje_id = $1',
      [segundo.viaje.id],
    );
    assert.equal(cobros.rows[0].total, 0);
  });

  test('finalizar con clave y cancelar por el chofer sobre EN_CURSO: un solo cobro y chofer libre', async () => {
    const { viaje, chofer } = await kit.crearViajeEnCurso();

    const resultados = await Promise.allSettled([
      kit.finalizarViaje({
        viajeId: viaje.id,
        choferId: chofer.usuario.id,
        claveIdempotencia: 'finalizar-vs-cancelar-chof',
      }),
      kit.cancelarViaje({
        viajeId: viaje.id,
        actor: { usuarioId: chofer.usuario.id, rol: ROLES.CHOFER },
        motivo: 'No puedo continuar el viaje',
      }),
    ]);

    const exitosos = resultados.filter((resultado) => resultado.status === 'fulfilled');
    const rechazados = resultados.filter((resultado) => resultado.status === 'rejected');
    assert.equal(exitosos.length, 1);
    assert.equal(rechazados.length, 1);
    assert.equal(rechazados[0].reason.codigo, 'TRANSICION_INVALIDA');

    const fila = await kit.baseDeDatos.query('SELECT estado FROM viajes WHERE id = $1', [viaje.id]);
    const cobros = await kit.baseDeDatos.query(
      'SELECT COUNT(*)::int AS total FROM cobros_simulados WHERE viaje_id = $1',
      [viaje.id],
    );
    const perfil = await kit.repositorioChoferes.buscarPorUsuarioId(chofer.usuario.id);

    // El dominio no permite cancelar desde EN_CURSO, así que finalizar gana
    // siempre. Se cubre igualmente la rama alternativa para que un cambio de
    // reglas no deje un viaje terminal con el chofer ocupado sin detectarlo.
    if (fila.rows[0].estado === 'FINALIZADO') {
      assert.equal(exitosos[0].value.reutilizada, false);
      assert.equal(cobros.rows[0].total, 1);
    } else {
      assert.equal(fila.rows[0].estado, 'CANCELADO_POR_CHOFER');
      assert.equal(cobros.rows[0].total, 0);
    }
    assert.equal(perfil.viajeActivoId, null);
  });

  test('aceptación y cancelación simultáneas dejan el viaje cancelado y al chofer libre', async () => {
    const { viaje, pasajero } = await kit.crearViajeDePrueba();
    const { usuario: chofer } = await kit.crearChofer();

    const [aceptacion, cancelacion] = await Promise.allSettled([
      kit.aceptarViaje({ viajeId: viaje.id, choferId: chofer.id }),
      kit.cancelarViaje({
        viajeId: viaje.id,
        actor: { usuarioId: pasajero.id, rol: ROLES.PASAJERO },
        motivo: 'Cambio de planes',
      }),
    ]);

    assert.equal(cancelacion.status, 'fulfilled');

    if (aceptacion.status === 'rejected') {
      assert.equal(aceptacion.reason.codigo, 'VIAJE_NO_DISPONIBLE');
    }

    const fila = await kit.baseDeDatos.query(
      `SELECT estado, chofer_id, motivo_cancelacion
         FROM viajes
        WHERE id = $1`,
      [viaje.id],
    );
    assert.equal(fila.rows[0].estado, 'CANCELADO_POR_PASAJERO');
    assert.equal(fila.rows[0].motivo_cancelacion, 'Cambio de planes');

    const perfil = await kit.repositorioChoferes.buscarPorUsuarioId(chofer.id);
    assert.equal(perfil.viajeActivoId, null);

    const activos = await kit.baseDeDatos.query(
      'SELECT COUNT(*)::int AS total FROM choferes WHERE viaje_activo_id IS NOT NULL',
    );
    assert.equal(activos.rows[0].total, 0);
  });

  test('cancelación por un chofer no asignado compite con una aceptación y falla NO_AUTORIZADO', async () => {
    const { viaje } = await kit.crearViajeDePrueba();
    const { usuario: choferNoAsignado } = await kit.crearChofer();
    const { usuario: choferAcepta } = await kit.crearChofer();

    const resultados = await Promise.allSettled([
      kit.cancelarViaje({
        viajeId: viaje.id,
        actor: { usuarioId: choferNoAsignado.id, rol: ROLES.CHOFER },
        motivo: 'No estoy asignado a este viaje',
      }),
      kit.aceptarViaje({ viajeId: viaje.id, choferId: choferAcepta.id }),
    ]);

    const [cancelacion, aceptacion] = resultados;

    // Expected: el chofer nunca está asignado al viaje, gane la carrera quien
    // gane, así que la cancelación siempre termina con NO_AUTORIZADO.
    assert.equal(cancelacion.status, 'rejected');
    assert.equal(cancelacion.reason.codigo, 'NO_AUTORIZADO');
    assert.equal(aceptacion.status, 'fulfilled');

    const fila = await kit.baseDeDatos.query(
      'SELECT estado, chofer_id, cancelado_por_id FROM viajes WHERE id = $1',
      [viaje.id],
    );
    assert.equal(fila.rows[0].estado, 'ASIGNADO');
    assert.equal(fila.rows[0].chofer_id, choferAcepta.id);
    assert.equal(fila.rows[0].cancelado_por_id, null);

    const perfilNoAsignado = await kit.repositorioChoferes.buscarPorUsuarioId(choferNoAsignado.id);
    const perfilAsignado = await kit.repositorioChoferes.buscarPorUsuarioId(choferAcepta.id);
    assert.equal(perfilNoAsignado.viajeActivoId, null);
    assert.equal(perfilAsignado.viajeActivoId, viaje.id);
  });

  test('cancelación del chofer asignado vs aceptación de otro chofer sin dejar ocupados', async () => {
    const { viaje, chofer } = await kit.crearViajeAsignado();
    const { usuario: segundoChofer } = await kit.crearChofer();

    const resultados = await Promise.allSettled([
      kit.cancelarViaje({
        viajeId: viaje.id,
        actor: { usuarioId: chofer.usuario.id, rol: ROLES.CHOFER },
        motivo: 'No puedo llegar al origen',
      }),
      kit.aceptarViaje({ viajeId: viaje.id, choferId: segundoChofer.id }),
    ]);

    const [cancelacion, aceptacion] = resultados;
    assert.equal(cancelacion.status, 'fulfilled');
    assert.equal(cancelacion.value.estado, 'CANCELADO_POR_CHOFER');
    assert.equal(aceptacion.status, 'rejected');
    assert.equal(aceptacion.reason.codigo, 'VIAJE_NO_DISPONIBLE');

    const fila = await kit.baseDeDatos.query('SELECT estado, chofer_id FROM viajes WHERE id = $1', [
      viaje.id,
    ]);
    assert.equal(fila.rows[0].estado, 'CANCELADO_POR_CHOFER');
    assert.equal(fila.rows[0].chofer_id, chofer.usuario.id);

    for (const usuarioId of [chofer.usuario.id, segundoChofer.id]) {
      const perfil = await kit.repositorioChoferes.buscarPorUsuarioId(usuarioId);
      assert.equal(perfil.viajeActivoId, null);
    }

    const ocupados = await kit.baseDeDatos.query(
      'SELECT COUNT(*)::int AS total FROM choferes WHERE viaje_activo_id = $1',
      [viaje.id],
    );
    assert.equal(ocupados.rows[0].total, 0);
  });

  test('el chofer asignado cancela el viaje y queda libre', async () => {
    const { viaje, chofer } = await kit.crearViajeAsignado();

    const cancelado = await kit.cancelarViaje({
      viajeId: viaje.id,
      actor: { usuarioId: chofer.usuario.id, rol: ROLES.CHOFER },
      motivo: 'No puedo llegar al origen',
    });

    assert.equal(cancelado.estado, 'CANCELADO_POR_CHOFER');
    assert.equal(cancelado.canceladoPorId, chofer.usuario.id);

    const fila = await kit.baseDeDatos.query(
      `SELECT estado, chofer_id, cancelado_por_id, motivo_cancelacion, cerrado_en
         FROM viajes
        WHERE id = $1`,
      [viaje.id],
    );
    assert.equal(fila.rows[0].estado, 'CANCELADO_POR_CHOFER');
    assert.equal(fila.rows[0].chofer_id, chofer.usuario.id);
    assert.equal(fila.rows[0].cancelado_por_id, chofer.usuario.id);
    assert.equal(fila.rows[0].motivo_cancelacion, 'No puedo llegar al origen');
    assert.notEqual(fila.rows[0].cerrado_en, null);

    const perfil = await kit.repositorioChoferes.buscarPorUsuarioId(chofer.usuario.id);
    assert.equal(perfil.viajeActivoId, null);
    assert.equal(perfil.estado, 'DISPONIBLE');
  });

  test('el pasajero puede cancelar con el chofer en camino y lo libera', async () => {
    const { viaje, chofer, pasajero } = await kit.crearViajeEnCamino();

    const cancelado = await kit.cancelarViaje({
      viajeId: viaje.id,
      actor: { usuarioId: pasajero.id, rol: ROLES.PASAJERO },
      motivo: 'Cambio de planes',
    });

    assert.equal(cancelado.estado, 'CANCELADO_POR_PASAJERO');
    assert.equal(cancelado.canceladoPorId, pasajero.id);

    const fila = await kit.baseDeDatos.query(
      'SELECT estado, iniciado_en, cancelado_por_id FROM viajes WHERE id = $1',
      [viaje.id],
    );
    assert.equal(fila.rows[0].estado, 'CANCELADO_POR_PASAJERO');
    assert.equal(fila.rows[0].iniciado_en, null);
    assert.equal(fila.rows[0].cancelado_por_id, pasajero.id);

    const perfil = await kit.repositorioChoferes.buscarPorUsuarioId(chofer.usuario.id);
    assert.equal(perfil.viajeActivoId, null);
  });

  test('marcar en camino y cancelar por el pasajero sobre ASIGNADO deja un estado coherente', async () => {
    const { viaje, chofer, pasajero } = await kit.crearViajeAsignado();

    const resultados = await Promise.allSettled([
      kit.marcarEnCamino({ viajeId: viaje.id, choferId: chofer.usuario.id }),
      kit.cancelarViaje({
        viajeId: viaje.id,
        actor: { usuarioId: pasajero.id, rol: ROLES.PASAJERO },
        motivo: 'Cambio de planes',
      }),
    ]);

    const [enCamino, cancelacion] = resultados;

    assert.equal(
      resultados.some((resultado) => resultado.status === 'fulfilled'),
      true,
    );

    for (const rechazo of resultados.filter((resultado) => resultado.status === 'rejected')) {
      assert.equal(rechazo.reason.codigo, 'TRANSICION_INVALIDA');
    }

    const fila = await kit.baseDeDatos.query(
      'SELECT estado, iniciado_en FROM viajes WHERE id = $1',
      [viaje.id],
    );
    const perfil = await kit.repositorioChoferes.buscarPorUsuarioId(chofer.usuario.id);

    // El dominio permite cancelar desde CHOFER_EN_CAMINO, así que si
    // `marcarEnCamino` adquiere el bloqueo primero ambas operaciones pueden
    // completarse serializadas. Lo que no puede pasar es un viaje cancelado con
    // el chofer ocupado ni un en-camino sobre un viaje cancelado.
    assert.equal(
      ['CHOFER_EN_CAMINO', 'CANCELADO_POR_PASAJERO'].includes(fila.rows[0].estado),
      true,
    );

    if (cancelacion.status === 'fulfilled') {
      assert.equal(fila.rows[0].estado, 'CANCELADO_POR_PASAJERO');
      assert.equal(fila.rows[0].iniciado_en, null);
      assert.equal(perfil.viajeActivoId, null);
    } else {
      assert.equal(enCamino.status, 'fulfilled');
      assert.equal(fila.rows[0].estado, 'CHOFER_EN_CAMINO');
      assert.equal(perfil.viajeActivoId, viaje.id);
    }
  });

  test('el caso de uso rechaza motivos vacíos y mayores a 500 caracteres', async () => {
    const { viaje, pasajero } = await kit.crearViajeDePrueba();
    const actor = { usuarioId: pasajero.id, rol: ROLES.PASAJERO };

    for (const motivo of ['', '   ', 'x'.repeat(501)]) {
      await assert.rejects(
        () => kit.cancelarViaje({ viajeId: viaje.id, actor, motivo }),
        (error) => error instanceof ErrorDeDominio && error.codigo === 'DATOS_INVALIDOS',
      );
    }

    const sinCancelar = await kit.baseDeDatos.query(
      'SELECT estado, motivo_cancelacion FROM viajes WHERE id = $1',
      [viaje.id],
    );
    assert.equal(sinCancelar.rows[0].estado, 'SOLICITADO');
    assert.equal(sinCancelar.rows[0].motivo_cancelacion, null);

    const cancelado = await kit.cancelarViaje({
      viajeId: viaje.id,
      actor,
      motivo: 'y'.repeat(500),
    });
    assert.equal(cancelado.motivoCancelacion.length, 500);
  });

  test('marcar en camino e iniciar concurrentes: solo una transición gana', async () => {
    const { viaje, chofer } = await kit.crearViajeAsignado();

    const enCamino = await Promise.allSettled(
      Array.from({ length: 6 }, () =>
        kit.marcarEnCamino({ viajeId: viaje.id, choferId: chofer.usuario.id }),
      ),
    );

    assert.equal(enCamino.filter((resultado) => resultado.status === 'fulfilled').length, 1);

    for (const rechazo of enCamino.filter((resultado) => resultado.status === 'rejected')) {
      assert.equal(rechazo.reason.codigo, 'TRANSICION_INVALIDA');
    }

    const inicios = await Promise.allSettled(
      Array.from({ length: 6 }, () =>
        kit.iniciarViaje({ viajeId: viaje.id, choferId: chofer.usuario.id }),
      ),
    );

    const exitosos = inicios.filter((resultado) => resultado.status === 'fulfilled');
    assert.equal(exitosos.length, 1);
    assert.equal(exitosos[0].value.estado, 'EN_CURSO');

    for (const rechazo of inicios.filter((resultado) => resultado.status === 'rejected')) {
      assert.equal(rechazo.reason.codigo, 'TRANSICION_INVALIDA');
    }

    const fila = await kit.baseDeDatos.query(
      'SELECT estado, iniciado_en FROM viajes WHERE id = $1',
      [viaje.id],
    );
    assert.equal(fila.rows[0].estado, 'EN_CURSO');
    assert.notEqual(fila.rows[0].iniciado_en, null);
  });

  test('inicio y cancelación simultáneos dejan un único resultado coherente', async () => {
    const { viaje, chofer, pasajero } = await kit.crearViajeEnCamino();

    const [inicio, cancelacion] = await Promise.allSettled([
      kit.iniciarViaje({ viajeId: viaje.id, choferId: chofer.usuario.id }),
      kit.cancelarViaje({
        viajeId: viaje.id,
        actor: { usuarioId: pasajero.id, rol: ROLES.PASAJERO },
        motivo: 'Cambio de planes',
      }),
    ]);

    assert.equal(
      [inicio, cancelacion].filter((resultado) => resultado.status === 'fulfilled').length,
      1,
    );

    for (const rechazo of [inicio, cancelacion].filter(
      (resultado) => resultado.status === 'rejected',
    )) {
      assert.equal(rechazo.reason.codigo, 'TRANSICION_INVALIDA');
    }

    const fila = await kit.baseDeDatos.query(
      'SELECT estado, iniciado_en FROM viajes WHERE id = $1',
      [viaje.id],
    );
    const perfil = await kit.repositorioChoferes.buscarPorUsuarioId(chofer.usuario.id);

    if (fila.rows[0].estado === 'EN_CURSO') {
      assert.notEqual(fila.rows[0].iniciado_en, null);
      assert.equal(perfil.viajeActivoId, viaje.id);
    } else {
      assert.equal(fila.rows[0].estado, 'CANCELADO_POR_PASAJERO');
      assert.equal(fila.rows[0].iniciado_en, null);
      assert.equal(perfil.viajeActivoId, null);
    }
  });

  test('finalizar desde ASIGNADO se rechaza y no genera cobro', async () => {
    const { viaje, chofer } = await kit.crearViajeAsignado();

    await assert.rejects(
      () =>
        kit.finalizarViaje({
          viajeId: viaje.id,
          choferId: chofer.usuario.id,
          claveIdempotencia: 'finalizar-asignado',
        }),
      (error) => error.codigo === 'TRANSICION_INVALIDA',
    );

    const fila = await kit.baseDeDatos.query(
      'SELECT estado, iniciado_en, cerrado_en FROM viajes WHERE id = $1',
      [viaje.id],
    );
    assert.equal(fila.rows[0].estado, 'ASIGNADO');
    assert.equal(fila.rows[0].iniciado_en, null);
    assert.equal(fila.rows[0].cerrado_en, null);

    const cobros = await kit.baseDeDatos.query(
      'SELECT COUNT(*)::int AS total FROM cobros_simulados WHERE viaje_id = $1',
      [viaje.id],
    );
    assert.equal(cobros.rows[0].total, 0);
  });

  test('el composition root opera de extremo a extremo sobre PostgreSQL real', async (t) => {
    const composicion = composeApplication(
      loadEnv({
        NODE_ENV: 'test',
        HOST: '127.0.0.1',
        PORT: '3000',
        LOG_LEVEL: 'silent',
        ADAPTERS_MODE: 'real',
        DATABASE_URL: TEST_DATABASE_URL,
        JWT_SECRET: 'secreto-http-real-de-al-menos-32-caracteres',
        PASSWORD_HASH_COST: '4',
      }),
    );
    const { servidor, urlBase } = await iniciarServidor(composicion.app);

    t.after(async () => {
      await detenerServidor(servidor);
      await composicion.shutdown();
    });

    await composicion.repositorioUsuarios.crear(
      new Usuario({
        id: randomUUID(),
        email: 'admin@integracion.test',
        nombre: 'Admin',
        credencial: await composicion.hasherContrasenas.hashear('Admin1234'),
        rol: ROLES.ADMINISTRADOR,
        creadoEn: new Date(),
      }),
    );

    const admin = await iniciarSesionHttp(urlBase, 'admin@integracion.test', 'Admin1234');
    const pasajero = await crearCuentaHttp(urlBase, {
      email: 'pasajero@integracion.test',
      nombre: 'Pasajero',
      rol: 'PASAJERO',
    });
    const chofer = await crearCuentaHttp(urlBase, {
      email: 'chofer@integracion.test',
      nombre: 'Chofer',
      rol: 'CHOFER',
    });

    const listo = await fetch(`${urlBase}/ready`);
    assert.equal(listo.status, 200);
    const estado = await listo.json();
    assert.equal(estado.estado, 'listo');
    assert.equal(estado.chequeos.baseDeDatos.ok, true);
    assert.equal(estado.chequeos.usuarios.ok, true);
    assert.equal(estado.chequeos.choferes.ok, true);
    assert.equal(estado.chequeos.viajes.ok, true);
    assert.equal(estado.chequeos.cobros.ok, true);
    assert.equal(estado.chequeos.idempotencia.ok, true);
    assert.equal(estado.chequeos.vehiculos.ok, true);

    const vehiculo = await llamarHttp(`${urlBase}/choferes/yo/vehiculo`, {
      method: 'PUT',
      token: chofer.token,
      body: { patente: 'AE123ZZ', marca: 'Toyota', modelo: 'Etios' },
    });
    assert.equal(vehiculo.respuesta.status, 201);

    const habilitacion = await llamarHttp(`${urlBase}/choferes/${chofer.usuario.id}/habilitacion`, {
      method: 'PATCH',
      token: admin.token,
      body: { habilitado: true },
    });
    assert.equal(habilitacion.respuesta.status, 200);

    const disponibilidad = await llamarHttp(`${urlBase}/choferes/yo`, {
      method: 'PATCH',
      token: chofer.token,
      body: { disponible: true },
    });
    assert.equal(disponibilidad.respuesta.status, 200);

    const ubicacion = await llamarHttp(`${urlBase}/choferes/yo/ubicacion`, {
      method: 'PUT',
      token: chofer.token,
      body: { lat: -34.6037, lng: -58.3816 },
    });
    assert.equal(ubicacion.respuesta.status, 200);

    const creacion = await llamarHttp(`${urlBase}/viajes`, {
      method: 'POST',
      token: pasajero.token,
      headers: { 'Idempotency-Key': 'flujo-http-real' },
      body: { origen: ORIGEN, destino: DESTINO },
    });
    assert.equal(creacion.respuesta.status, 201);

    const repeticion = await llamarHttp(`${urlBase}/viajes`, {
      method: 'POST',
      token: pasajero.token,
      headers: { 'Idempotency-Key': 'flujo-http-real' },
      body: { origen: ORIGEN, destino: DESTINO },
    });
    assert.equal(repeticion.respuesta.status, 200);
    assert.equal(repeticion.respuesta.headers.get('idempotency-replayed'), 'true');
    assert.equal(repeticion.cuerpo.viaje.id, creacion.cuerpo.viaje.id);

    const viajeId = creacion.cuerpo.viaje.id;
    const aceptacion = await llamarHttp(`${urlBase}/viajes/${viajeId}/aceptar`, {
      method: 'POST',
      token: chofer.token,
    });
    assert.equal(aceptacion.respuesta.status, 200);
    assert.equal(aceptacion.cuerpo.viaje.estado, 'ASIGNADO');

    const enBase = await kit.baseDeDatos.query(
      'SELECT estado, chofer_id FROM viajes WHERE id = $1',
      [viajeId],
    );
    assert.equal(enBase.rows[0].estado, 'ASIGNADO');
    assert.equal(enBase.rows[0].chofer_id, chofer.usuario.id);

    const cancelacion = await llamarHttp(`${urlBase}/viajes/${viajeId}/cancelar`, {
      method: 'POST',
      token: pasajero.token,
      body: { motivo: 'Fin del flujo' },
    });
    assert.equal(cancelacion.respuesta.status, 200);
    assert.equal(cancelacion.cuerpo.viaje.estado, 'CANCELADO_POR_PASAJERO');

    const perfil = await llamarHttp(`${urlBase}/choferes/yo`, { token: chofer.token });
    assert.equal(perfil.respuesta.status, 200);
    assert.equal(perfil.cuerpo.chofer.viajeActivoId, null);
    assert.equal(perfil.cuerpo.chofer.estado, 'DISPONIBLE');
  });
});
