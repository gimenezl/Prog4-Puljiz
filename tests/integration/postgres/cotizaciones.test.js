import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, describe, test } from 'node:test';

import { aplicarMigraciones } from '../../../scripts/migrate.js';
import { crearConfirmarCotizacion } from '../../../src/application/use-cases/cotizaciones/confirmar-cotizacion.js';
import { crearCotizar } from '../../../src/application/use-cases/cotizaciones/cotizar.js';
import {
  crearCrearRegla,
  crearCrearTarifa,
  crearCrearZona,
  crearPublicarRegla,
  crearPublicarTarifa,
} from '../../../src/application/use-cases/configuracion/configuracion-administrativa.js';
import { ROLES, Usuario } from '../../../src/domain/entities/usuario.js';
import { FixedClock } from '../../../src/infrastructure/adapters/out/clock/fixed-clock.js';
import { MedidorDeDemanda } from '../../../src/infrastructure/adapters/out/demanda/medidor-de-demanda.js';
import { CryptoIdGenerator } from '../../../src/infrastructure/adapters/out/ids/crypto-id-generator.js';
import { EstimadorDeRecorridoHaversine } from '../../../src/infrastructure/adapters/out/recorrido/estimador-de-recorrido.js';
import { PostgresChoferRepository } from '../../../src/infrastructure/adapters/out/persistence/postgres-chofer-repository.js';
import { PostgresCotizacionRepository } from '../../../src/infrastructure/adapters/out/persistence/postgres-cotizacion-repository.js';
import { PostgresDatabase } from '../../../src/infrastructure/adapters/out/persistence/postgres-database.js';
import { PostgresIdempotencyRepository } from '../../../src/infrastructure/adapters/out/persistence/postgres-idempotency-repository.js';
import { PostgresReglaRepository } from '../../../src/infrastructure/adapters/out/persistence/postgres-regla-repository.js';
import { PostgresTarifaRepository } from '../../../src/infrastructure/adapters/out/persistence/postgres-tarifa-repository.js';
import { PostgresUbicacionRepository } from '../../../src/infrastructure/adapters/out/persistence/postgres-ubicacion-repository.js';
import { PostgresUnitOfWork } from '../../../src/infrastructure/adapters/out/persistence/postgres-unit-of-work.js';
import { PostgresUserRepository } from '../../../src/infrastructure/adapters/out/persistence/postgres-user-repository.js';
import { PostgresViajeRepository } from '../../../src/infrastructure/adapters/out/persistence/postgres-viaje-repository.js';
import { PostgresZonaRepository } from '../../../src/infrastructure/adapters/out/persistence/postgres-zona-repository.js';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const describirPostgres = TEST_DATABASE_URL ? describe : describe.skip;
const AHORA = new Date('2026-01-01T00:00:00.000Z');
const ORIGEN = { lat: -34.6037, lng: -58.3816 };
const DESTINO = { lat: -34.6083, lng: -58.3712 };
const CRITERIO = {
  tipo: 'POLIGONO',
  puntos: [
    { lat: -34.62, lng: -58.4 },
    { lat: -34.59, lng: -58.4 },
    { lat: -34.59, lng: -58.36 },
    { lat: -34.62, lng: -58.36 },
  ],
};
const ADMIN = { id: null, rol: ROLES.ADMINISTRADOR };
const PASAJERO_ID = '33333333-3333-4333-8333-333333333333';

describirPostgres('cotizaciones inmutables y precio fijado (RF-23 + ADR-0005)', () => {
  let baseDeDatos;
  let kit;

  before(async () => {
    baseDeDatos = new PostgresDatabase({
      connectionString: TEST_DATABASE_URL,
      max: 25,
      connectionTimeoutMs: 5000,
      statementTimeoutMs: 15000,
    });
    await aplicarMigraciones(baseDeDatos);

    const repositorioZonas = new PostgresZonaRepository({ baseDeDatos });
    const repositorioTarifas = new PostgresTarifaRepository({ baseDeDatos });
    const repositorioReglas = new PostgresReglaRepository({ baseDeDatos });
    const repositorioCotizaciones = new PostgresCotizacionRepository({ baseDeDatos });
    const repositorioViajes = new PostgresViajeRepository({ baseDeDatos });
    const repositorioChoferes = new PostgresChoferRepository({ baseDeDatos });
    const repositorioUbicaciones = new PostgresUbicacionRepository({ baseDeDatos });
    const repositorioUsuarios = new PostgresUserRepository({ baseDeDatos });
    const repositorioClavesIdempotencia = new PostgresIdempotencyRepository({ baseDeDatos });
    const unidadDeTrabajo = new PostgresUnitOfWork({ baseDeDatos });
    const reloj = new FixedClock(AHORA);
    const generadorIds = new CryptoIdGenerator();

    kit = {
      reloj,
      generadorIds,
      baseDeDatos,
      repositorioZonas,
      repositorioTarifas,
      repositorioReglas,
      repositorioCotizaciones,
      repositorioViajes,
      repositorioChoferes,
      repositorioUbicaciones,
      repositorioUsuarios,
      repositorioClavesIdempotencia,
      unidadDeTrabajo,
      crearZona: crearCrearZona({ repositorioZonas, unidadDeTrabajo, reloj, generadorIds }),
      crearTarifa: crearCrearTarifa({ repositorioTarifas, unidadDeTrabajo, reloj, generadorIds }),
      publicarTarifa: crearPublicarTarifa({ repositorioTarifas, unidadDeTrabajo, reloj }),
      crearRegla: crearCrearRegla({ repositorioReglas, unidadDeTrabajo, reloj, generadorIds }),
      publicarRegla: crearPublicarRegla({ repositorioReglas, unidadDeTrabajo, reloj }),
      cotizar: crearCotizar({
        repositorioZonas,
        repositorioTarifas,
        repositorioReglas,
        repositorioCotizaciones,
        medidorDeDemanda: new MedidorDeDemanda({
          repositorioViajes,
          repositorioChoferes,
          repositorioUbicaciones,
          ventanaMs: 300_000,
          ubicacionVigenciaMs: 60_000,
        }),
        estimadorDeRecorrido: new EstimadorDeRecorridoHaversine({ velocidadEstimadaKmh: 30 }),
        unidadDeTrabajo,
        reloj,
        generadorIds,
        vigenciaMs: 300_000,
      }),
      confirmar: crearConfirmarCotizacion({
        repositorioCotizaciones,
        repositorioViajes,
        repositorioClavesIdempotencia,
        unidadDeTrabajo,
        reloj,
        generadorIds,
      }),
    };
  });

  after(async () => {
    await baseDeDatos?.cerrar();
  });

  beforeEach(async () => {
    kit.reloj.fijar(AHORA);
    await baseDeDatos.query(
      `TRUNCATE TABLE cotizaciones, viajes, ubicaciones_vigentes, claves_idempotencia,
        choferes, reglas_multiplicador, tarifas, zonas_de_demanda, usuarios CASCADE`,
    );

    await kit.repositorioUsuarios.crear(
      new Usuario({
        id: PASAJERO_ID,
        email: 'pasajero@cotizaciones-db.test',
        nombre: 'Pasajero',
        credencial: 'credencial',
        rol: ROLES.PASAJERO,
        creadoEn: AHORA,
      }),
    );
    const admin = new Usuario({
      id: randomUUID(),
      email: 'admin@cotizaciones-db.test',
      nombre: 'Admin',
      credencial: 'credencial',
      rol: ROLES.ADMINISTRADOR,
      creadoEn: AHORA,
    });
    await kit.repositorioUsuarios.crear(admin);
    ADMIN.id = admin.id;
  });

  async function prepararConfiguracion() {
    const zona = await kit.crearZona({ actor: ADMIN, nombre: 'Centro', criterio: CRITERIO });
    const tarifa = await kit.crearTarifa({
      actor: ADMIN,
      baseCentavos: 100000,
      porKmCentavos: 50000,
      porMinutoCentavos: 10000,
      precioMaximoCentavos: 1000000,
    });
    await kit.publicarTarifa({ actor: ADMIN, tarifaId: tarifa.id });
    const regla = await kit.crearRegla({
      actor: ADMIN,
      umbralInferior: '0.5',
      umbralSuperior: '3',
      multiplicadorMinimo: '1',
      multiplicadorMaximo: '2',
      escalaMultiplicador: 2,
    });
    await kit.publicarRegla({ actor: ADMIN, reglaId: regla.id });

    return zona;
  }

  test('persiste la foto de la cotización con conteos y versiones, y la protege contra cambios', async () => {
    const zona = await prepararConfiguracion();
    const vista = await kit.cotizar({
      pasajeroId: PASAJERO_ID,
      origen: ORIGEN,
      destino: DESTINO,
    });

    const { rows } = await baseDeDatos.query(
      `SELECT zona_id, solicitudes_usadas, choferes_disponibles_usados,
              regla_id, regla_version, tarifa_id, tarifa_version,
              multiplicador, precio_centavos, parametros_conteo, estado
         FROM cotizaciones WHERE id = $1`,
      [vista.id],
    );
    const fila = rows[0];

    assert.equal(fila.zona_id, zona.id);
    assert.equal(fila.solicitudes_usadas, 0);
    assert.equal(fila.choferes_disponibles_usados, 0);
    assert.equal(fila.regla_version, 1);
    assert.equal(fila.tarifa_version, 1);
    assert.equal(fila.multiplicador, '1.0000');
    assert.equal(fila.precio_centavos, vista.precioCentavos);
    assert.equal(fila.parametros_conteo.zonaId, zona.id);
    assert.equal(fila.estado, 'VIGENTE');

    await assert.rejects(
      baseDeDatos.query('UPDATE cotizaciones SET precio_centavos = 1 WHERE id = $1', [vista.id]),
      /inmutable/,
    );
  });

  test('confirmar copia el precio al viaje, fija la cotización y respeta la idempotencia', async () => {
    await prepararConfiguracion();
    const cotizacion = await kit.cotizar({
      pasajeroId: PASAJERO_ID,
      origen: ORIGEN,
      destino: DESTINO,
    });

    const primera = await kit.confirmar({
      cotizacionId: cotizacion.id,
      pasajeroId: PASAJERO_ID,
      claveIdempotencia: 'db-confirmar-1',
    });
    const reintento = await kit.confirmar({
      cotizacionId: cotizacion.id,
      pasajeroId: PASAJERO_ID,
      claveIdempotencia: 'db-confirmar-1',
    });

    assert.equal(reintento.reutilizada, true);
    assert.equal(reintento.viaje.id, primera.viaje.id);

    const { rows } = await baseDeDatos.query(
      `SELECT c.estado AS estado_cotizacion, v.precio_fijado_centavos,
              v.multiplicador_fijado, v.cotizacion_id
         FROM cotizaciones c
         JOIN viajes v ON v.cotizacion_id = c.id
        WHERE c.id = $1`,
      [cotizacion.id],
    );

    assert.equal(rows.length, 1);
    assert.equal(rows[0].estado_cotizacion, 'CONFIRMADA');
    assert.equal(rows[0].precio_fijado_centavos, cotizacion.precioCentavos);
    assert.equal(rows[0].multiplicador_fijado, '1.0000');
    assert.equal(rows[0].cotizacion_id, cotizacion.id);

    await assert.rejects(
      baseDeDatos.query('DELETE FROM cotizaciones WHERE id = $1', [cotizacion.id]),
      /ya generó un viaje/,
    );
  });

  test('una cotización vencida no genera un viaje', async () => {
    await prepararConfiguracion();
    const cotizacion = await kit.cotizar({
      pasajeroId: PASAJERO_ID,
      origen: ORIGEN,
      destino: DESTINO,
    });

    kit.reloj.avanzar(300_001);

    await assert.rejects(
      kit.confirmar({
        cotizacionId: cotizacion.id,
        pasajeroId: PASAJERO_ID,
        claveIdempotencia: 'db-confirmar-vencida',
      }),
      (error) => error.codigo === 'COTIZACION_VENCIDA',
    );

    const { rows } = await baseDeDatos.query('SELECT COUNT(*)::int AS total FROM viajes');
    assert.equal(rows[0].total, 0);
  });

  // --- RF-19: el precio que vio el pasajero es el que paga ---------------

  /** Simula demanda alta en la zona: viajes SOLICITADO y ningún chofer. */
  async function subirDemanda(cantidad) {
    await baseDeDatos.query(
      `INSERT INTO viajes (
         id, pasajero_id, origen_lat, origen_lng, destino_lat, destino_lng,
         distancia_estimada_m, precio_fijado_centavos, estado, solicitado_en
       )
       SELECT gen_random_uuid(), $1, $2, $3, $4, $5, 1000, 150000, 'SOLICITADO', $6
         FROM generate_series(1, $7)`,
      [PASAJERO_ID, ORIGEN.lat, ORIGEN.lng, DESTINO.lat, DESTINO.lng, AHORA, cantidad],
    );
  }

  /** Recálculo del multiplicador: otra cotización de la misma zona. */
  const recalcular = () =>
    kit.cotizar({ pasajeroId: PASAJERO_ID, origen: ORIGEN, destino: DESTINO });

  async function viajeDe(cotizacionId) {
    const { rows } = await baseDeDatos.query(
      `SELECT precio_fijado_centavos, multiplicador_fijado FROM viajes WHERE cotizacion_id = $1`,
      [cotizacionId],
    );
    return rows;
  }

  for (const orden of ['recálculo antes de confirmar', 'confirmación antes de recalcular']) {
    test(`RF-19, ${orden}: el viaje queda con el precio visto`, async () => {
      await prepararConfiguracion();
      const vista = await recalcular();
      assert.equal(vista.multiplicador, '1.00');

      await subirDemanda(5);
      const confirmar = () =>
        kit.confirmar({
          cotizacionId: vista.id,
          pasajeroId: PASAJERO_ID,
          claveIdempotencia: `rf19-${orden}`,
        });

      let nueva;
      if (orden === 'recálculo antes de confirmar') {
        nueva = await recalcular();
        await confirmar();
      } else {
        await confirmar();
        nueva = await recalcular();
      }

      // La demanda subió: el recálculo da el multiplicador máximo de la regla...
      assert.equal(nueva.multiplicador, '2.00');
      assert.ok(nueva.precioCentavos > vista.precioCentavos);

      // ...pero el viaje confirmado conserva exactamente lo que vio el pasajero.
      const viajes = await viajeDe(vista.id);
      assert.equal(viajes.length, 1);
      assert.equal(viajes[0].precio_fijado_centavos, vista.precioCentavos);
      assert.equal(Number(viajes[0].multiplicador_fijado), Number(vista.multiplicador));
    });
  }

  test('RF-19, a la vez: recálculos, una regla nueva y la confirmación no cambian el precio', async () => {
    await prepararConfiguracion();
    const reglaNueva = await kit.crearRegla({
      actor: ADMIN,
      umbralInferior: '0.5',
      umbralSuperior: '3',
      multiplicadorMinimo: '1.5',
      multiplicadorMaximo: '2.5',
      escalaMultiplicador: 2,
    });

    for (let ronda = 1; ronda <= 5; ronda += 1) {
      const vista = await recalcular();
      await subirDemanda(2);

      const operaciones = [
        kit.confirmar({
          cotizacionId: vista.id,
          pasajeroId: PASAJERO_ID,
          claveIdempotencia: `rf19-simultaneo-${ronda}`,
        }),
        recalcular(),
        recalcular(),
      ];
      if (ronda === 3)
        operaciones.push(kit.publicarRegla({ actor: ADMIN, reglaId: reglaNueva.id }));

      const resultados = await Promise.allSettled(operaciones);
      assert.deepEqual(
        resultados.filter((r) => r.status === 'rejected').map((r) => r.reason.message),
        [],
        `ronda ${ronda}`,
      );

      const viajes = await viajeDe(vista.id);
      assert.equal(viajes.length, 1, `ronda ${ronda}`);
      assert.equal(viajes[0].precio_fijado_centavos, vista.precioCentavos, `ronda ${ronda}`);
      assert.equal(Number(viajes[0].multiplicador_fijado), Number(vista.multiplicador));
    }
  });
});
