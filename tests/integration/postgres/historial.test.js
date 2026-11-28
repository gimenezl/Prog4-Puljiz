import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';

import { aplicarMigraciones } from '../../../scripts/migrate.js';
import { crearKitPostgres } from '../../helpers/postgres-kit.js';

const describirPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;

describirPostgres('historial y viajes activos con paginación por cursor (RF-14, RF-15)', () => {
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

  const posicion = (viaje) => ({ solicitadoEn: viaje.solicitadoEn, id: viaje.id });

  /** Recorre todas las páginas y devuelve los ids en el orden visto. */
  async function recorrer(listar, limite) {
    const ids = [];
    let antesDe = null;

    for (;;) {
      const pagina = await listar({ limite, antesDe });
      if (pagina.length === 0) return ids;
      ids.push(...pagina.map((viaje) => viaje.id));
      antesDe = posicion(pagina.at(-1));
    }
  }

  test('el pasajero recorre todo su historial por páginas sin repetir ni saltear', async () => {
    const pasajero = await kit.crearUsuario();
    const otro = await kit.crearUsuario();
    const propios = [];

    for (let i = 0; i < 7; i += 1) {
      propios.push((await kit.crearViajeDePrueba({ pasajero })).viaje);
    }
    await kit.crearViajeDePrueba({ pasajero: otro });

    const vistos = await recorrer(
      (opciones) => kit.repositorioViajes.listarPorParticipante(pasajero.id, opciones),
      3,
    );

    // Del más nuevo al más viejo y sin el viaje del otro pasajero.
    assert.deepEqual(vistos, propios.map((viaje) => viaje.id).reverse());
  });

  test('el chofer ve los viajes que tuvo asignados y se puede filtrar por estado', async () => {
    const { viaje: asignado, chofer } = await kit.crearViajeAsignado();
    await kit.crearViajeDePrueba(); // solicitado: no es del chofer

    const delChofer = await kit.repositorioViajes.listarPorParticipante(chofer.usuario.id, {
      limite: 10,
    });
    assert.deepEqual(
      delChofer.map((viaje) => viaje.id),
      [asignado.id],
    );

    const soloFinalizados = await kit.repositorioViajes.listarPorParticipante(chofer.usuario.id, {
      limite: 10,
      estados: ['FINALIZADO'],
    });
    assert.deepEqual(soloFinalizados, []);
  });

  test('los viajes activos excluyen los terminados', async () => {
    const { viaje: solicitado } = await kit.crearViajeDePrueba();
    const { viaje: asignado } = await kit.crearViajeAsignado();
    const { viaje: aCancelar, pasajero } = await kit.crearViajeDePrueba();
    await kit.cancelarViaje({
      viajeId: aCancelar.id,
      actor: { usuarioId: pasajero.id, rol: 'PASAJERO' },
      motivo: 'Ya no lo necesito',
    });

    const activos = await recorrer((opciones) => kit.repositorioViajes.listarActivos(opciones), 1);

    assert.deepEqual(activos.sort(), [solicitado.id, asignado.id].sort());
  });

  test('con muchos viajes, el historial usa el índice del pasajero', async () => {
    const pasajero = await kit.crearUsuario();
    const otros = await kit.crearUsuario();
    await kit.baseDeDatos.query(
      `INSERT INTO viajes (
         id, pasajero_id, origen_lat, origen_lng, destino_lat, destino_lng,
         distancia_estimada_m, precio_fijado_centavos, estado, solicitado_en
       )
       SELECT gen_random_uuid(), CASE WHEN n % 50 = 0 THEN $1::uuid ELSE $2::uuid END,
              -34.6, -58.38, -34.61, -58.37, 1000, 150000, 'SOLICITADO',
              now() - n * interval '1 minute'
         FROM generate_series(1, 5000) AS n`,
      [pasajero.id, otros.id],
    );
    await kit.baseDeDatos.query('ANALYZE viajes');

    const { rows } = await kit.baseDeDatos.query(
      `EXPLAIN SELECT id FROM viajes
        WHERE (pasajero_id = $1 OR chofer_id = $1)
        ORDER BY solicitado_en DESC, id DESC
        LIMIT 20`,
      [pasajero.id],
    );
    const plan = rows.map((fila) => fila['QUERY PLAN']).join('\n');

    assert.match(plan, /viajes_pasajero_historial_idx/);
  });
});
