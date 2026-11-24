import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';

import { aplicarMigraciones } from '../../../scripts/migrate.js';
import { UbicacionChofer } from '../../../src/domain/entities/ubicacion-chofer.js';
import { JavaScriptBuscadorDeChoferes } from '../../../src/infrastructure/adapters/out/geografia/javascript-buscador-de-choferes.js';
import { PostgisBuscadorDeChoferes } from '../../../src/infrastructure/adapters/out/geografia/postgis-buscador-de-choferes.js';
import { BELGRANO, CONGRESO, OBELISCO, PALERMO } from '../../helpers/lugares.js';
import { crearKitPostgres } from '../../helpers/postgres-kit.js';

const describirPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;
const VIGENCIA_MS = 60_000;

describirPostgres('búsqueda de choferes cercanos con PostGIS (RF-06)', () => {
  let kit;
  let postgis;
  let javascript;

  before(async () => {
    kit = crearKitPostgres();
    await aplicarMigraciones(kit.baseDeDatos);
    postgis = new PostgisBuscadorDeChoferes({ baseDeDatos: kit.baseDeDatos });
    javascript = new JavaScriptBuscadorDeChoferes({
      repositorioChoferes: kit.repositorioChoferes,
      repositorioUbicaciones: kit.repositorioUbicaciones,
    });
  });

  after(async () => {
    await kit?.cerrar();
  });

  beforeEach(async () => {
    await kit.limpiar();
  });

  // El kit crea cada chofer con una ubicación vigente en el Obelisco; acá se
  // la mueve al lugar del escenario con una hora posterior.
  async function choferEn(punto, opciones = {}) {
    const { usuario } = await kit.crearChofer(opciones);
    await kit.repositorioUbicaciones.guardar(
      new UbicacionChofer({ choferId: usuario.id, punto, actualizadaEn: new Date() }),
    );
    return usuario.id;
  }

  async function prepararEscenario() {
    const ids = {
      congreso: await choferEn(CONGRESO),
      palermo: await choferEn(PALERMO),
      belgrano: await choferEn(BELGRANO),
      inhabilitado: await choferEn(OBELISCO, { habilitado: false }),
      noDisponible: await choferEn(OBELISCO, { disponible: false }),
      vencido: await choferEn(OBELISCO),
      sinUbicacion: await choferEn(OBELISCO),
    };

    const { chofer: ocupado } = await kit.crearViajeAsignado();
    ids.ocupado = ocupado.usuario.id;

    await kit.baseDeDatos.query(
      `UPDATE ubicaciones_vigentes SET actualizada_en = now() - interval '2 minutes'
        WHERE chofer_id = $1`,
      [ids.vencido],
    );
    await kit.baseDeDatos.query('DELETE FROM ubicaciones_vigentes WHERE chofer_id = $1', [
      ids.sinUbicacion,
    ]);

    return ids;
  }

  const criterios = (sobrescrituras = {}) => ({
    origen: OBELISCO,
    radioM: 5000,
    limite: 10,
    ahora: new Date(),
    vigenciaUbicacionMs: VIGENCIA_MS,
    ...sobrescrituras,
  });

  test('devuelve solo choferes elegibles dentro del radio, ordenados por distancia', async () => {
    const ids = await prepararEscenario();

    const resultado = await postgis.buscar(criterios());

    assert.deepEqual(
      resultado.map((candidato) => candidato.choferId),
      [ids.congreso, ids.palermo],
    );
    assert.equal(Math.round(resultado[0].distanciaM / 100), 12);
    assert.equal(Math.round(resultado[1].distanciaM / 100), 48);

    assert.deepEqual(
      (await postgis.buscar(criterios({ limite: 1 }))).map((c) => c.choferId),
      [ids.congreso],
    );
    assert.equal((await postgis.buscar(criterios({ radioM: 9000 }))).length, 3);
  });

  test('PostGIS y el filtrado en JavaScript devuelven los mismos candidatos', async () => {
    await prepararEscenario();

    for (const radioM of [500, 2000, 5000, 9000]) {
      const enBase = await postgis.buscar(criterios({ radioM }));
      const enJavaScript = await javascript.buscar(criterios({ radioM }));

      assert.deepEqual(
        enBase.map((c) => c.choferId),
        enJavaScript.map((c) => c.choferId),
        `radio ${radioM} m`,
      );

      // PostGIS mide sobre el elipsoide y Haversine sobre una esfera: difieren
      // en menos de 0,5 %.
      enBase.forEach((candidato, indice) => {
        const diferencia = Math.abs(candidato.distanciaM - enJavaScript[indice].distanciaM);
        assert.ok(diferencia <= candidato.distanciaM * 0.005, `diferencia de ${diferencia} m`);
      });
    }
  });

  test('los viajes cercanos usan el origen generado y solo los SOLICITADO', async () => {
    const enPalermo = await kit.crearViajeDePrueba({ origen: PALERMO });
    const enCongreso = await kit.crearViajeDePrueba({ origen: CONGRESO });
    await kit.crearViajeDePrueba({ origen: BELGRANO });
    const { viaje: asignado } = await kit.crearViajeAsignado(); // origen en el Obelisco

    // La columna generada se calcula sola a partir de origen_lat y origen_lng.
    const { rows } = await kit.baseDeDatos.query(
      'SELECT ST_Y(origen::geometry) AS lat, ST_X(origen::geometry) AS lng FROM viajes WHERE id = $1',
      [enPalermo.viaje.id],
    );
    assert.deepEqual({ lat: rows[0].lat, lng: rows[0].lng }, PALERMO);

    const cercanos = await kit.repositorioViajes.listarSolicitadosCerca(OBELISCO, 5000, 50);

    assert.deepEqual(
      cercanos.map(({ viaje }) => viaje.id),
      [enCongreso.viaje.id, enPalermo.viaje.id],
    );
    assert.equal(
      cercanos.some(({ viaje }) => viaje.id === asignado.id),
      false,
      'un viaje ASIGNADO no aparece aunque esté en el centro',
    );
    assert.equal(Math.round(cercanos[1].distanciaM / 100), 48);
  });

  test('la consulta usa el índice GiST de la ubicación', async () => {
    await prepararEscenario();
    // Con pocas filas el planificador prefiere recorrer la tabla: se desactiva
    // esa opción solo para comprobar que el índice es utilizable.
    const plan = await kit.baseDeDatos.transaccion(async (tx) => {
      await tx.query('SET LOCAL enable_seqscan = off');
      const { rows } = await tx.query(
        `EXPLAIN SELECT chofer_id FROM ubicaciones_vigentes
          WHERE ST_DWithin(posicion, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, 5000)`,
        [OBELISCO.lng, OBELISCO.lat],
      );
      return rows.map((fila) => fila['QUERY PLAN']).join('\n');
    });

    assert.match(plan, /ubicaciones_vigentes_posicion_idx/);
  });

  test('con 500 viajes solicitados, el planificador elige el índice GiST del origen', async () => {
    // Con pocos viajes conviene más el índice por estado. Con muchos viajes
    // SOLICITADO repartidos por la ciudad, filtrar por estado ya no descarta
    // nada y el índice espacial es el que achica la búsqueda.
    const pasajero = await kit.crearUsuario();
    await kit.baseDeDatos.query(
      `INSERT INTO viajes (
         id, pasajero_id, origen_lat, origen_lng, destino_lat, destino_lng,
         distancia_estimada_m, precio_fijado_centavos, estado, solicitado_en
       )
       SELECT gen_random_uuid(), $1,
              -34.9 + (n % 25) * 0.025, -58.7 + (n / 25) * 0.025,
              -34.60, -58.38, 1000, 150000, 'SOLICITADO', now()
         FROM generate_series(0, 499) AS n`,
      [pasajero.id],
    );
    await kit.baseDeDatos.query('ANALYZE viajes');

    const planViajes = await kit.baseDeDatos.transaccion(async (tx) => {
      const { rows } = await tx.query(
        `EXPLAIN SELECT id FROM viajes
          WHERE estado = 'SOLICITADO'
            AND ST_DWithin(origen, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, 5000)`,
        [OBELISCO.lng, OBELISCO.lat],
      );
      return rows.map((fila) => fila['QUERY PLAN']).join('\n');
    });

    assert.match(planViajes, /viajes_origen_solicitados_idx/);
  });
});
