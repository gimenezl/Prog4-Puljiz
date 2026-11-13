import assert from 'node:assert/strict';
import test from 'node:test';

import { CobroSimulado } from '../../../../src/domain/entities/cobro-simulado.js';
import { crearKitViajes } from '../../../helpers/viajes-kit.js';

test('finalizar un viaje asignado lo cierra, libera al chofer y registra un único cobro', async () => {
  const kit = crearKitViajes();
  const { viaje, chofer } = await kit.crearViajeAsignado();

  const resultado = await kit.finalizarViaje({
    viajeId: viaje.id,
    choferId: chofer.usuarioId,
    claveIdempotencia: 'finalizar-1',
  });

  assert.equal(resultado.reutilizada, false);
  assert.equal(resultado.viaje.estado, 'FINALIZADO');
  assert.equal(resultado.cobro.estado, 'COBRADO');
  assert.equal(resultado.cobro.montoCentavos, viaje.precioFijadoCentavos);
  assert.equal(resultado.cobro.referencia, `SIM-${viaje.id}`);
  assert.equal(kit.simuladorDeCobro.cantidadLlamadas, 1);

  const guardado = await kit.repositorioViajes.buscarPorId(viaje.id);
  assert.equal(guardado.estado, 'FINALIZADO');
  assert.equal(guardado.cerradoEn instanceof Date, true);

  const liberado = await kit.repositorioChoferes.buscarPorUsuarioId(chofer.usuarioId);
  assert.equal(liberado.viajeActivoId, null);
  assert.equal(liberado.estado, 'DISPONIBLE');

  const cobro = await kit.repositorioCobros.buscarPorViajeId(viaje.id);
  assert.equal(cobro.estado, 'COBRADO');
  assert.equal(cobro.referencia, `SIM-${viaje.id}`);

  const clave = await kit.repositorioClavesIdempotencia.buscar(
    `viaje:finalizar:${chofer.usuarioId}`,
    'finalizar-1',
  );
  assert.equal(clave.respuesta.cobro.id, resultado.cobro.id);
});

test('reintentar con la misma clave y el mismo viaje devuelve la respuesta original sin cobrar otra vez', async () => {
  const kit = crearKitViajes();
  const { viaje, chofer } = await kit.crearViajeAsignado();

  const primero = await kit.finalizarViaje({
    viajeId: viaje.id,
    choferId: chofer.usuarioId,
    claveIdempotencia: 'reintento',
  });
  const segundo = await kit.finalizarViaje({
    viajeId: viaje.id,
    choferId: chofer.usuarioId,
    claveIdempotencia: 'reintento',
  });

  assert.equal(segundo.reutilizada, true);
  assert.equal(segundo.viaje.id, primero.viaje.id);
  assert.equal(segundo.cobro.id, primero.cobro.id);
  assert.equal(segundo.cobro.referencia, primero.cobro.referencia);
  assert.equal(kit.simuladorDeCobro.cantidadLlamadas, 1);
  assert.equal(kit.repositorioCobros.instantaneaMemoria().size, 1);
});

test('la misma clave usada con otro viaje devuelve conflicto y no ejecuta otro cobro', async () => {
  const kit = crearKitViajes();
  const primero = await kit.crearViajeAsignado();

  await kit.finalizarViaje({
    viajeId: primero.viaje.id,
    choferId: primero.chofer.usuarioId,
    claveIdempotencia: 'clave-compartida',
  });

  const segundo = await kit.crearViajeAsignado({ chofer: primero.chofer });

  await assert.rejects(
    () =>
      kit.finalizarViaje({
        viajeId: segundo.viaje.id,
        choferId: primero.chofer.usuarioId,
        claveIdempotencia: 'clave-compartida',
      }),
    (error) => error.codigo === 'CLAVE_REUTILIZADA_CON_OTRO_CONTENIDO',
  );

  assert.equal(kit.simuladorDeCobro.cantidadLlamadas, 1);
  assert.equal(kit.repositorioCobros.instantaneaMemoria().size, 1);
  assert.equal((await kit.repositorioViajes.buscarPorId(segundo.viaje.id)).estado, 'ASIGNADO');
});

test('dos reintentos simultáneos con la misma clave cobran una sola vez', async () => {
  const kit = crearKitViajes();
  const { viaje, chofer } = await kit.crearViajeAsignado();

  const resultados = await Promise.all([
    kit.finalizarViaje({
      viajeId: viaje.id,
      choferId: chofer.usuarioId,
      claveIdempotencia: 'simultanea',
    }),
    kit.finalizarViaje({
      viajeId: viaje.id,
      choferId: chofer.usuarioId,
      claveIdempotencia: 'simultanea',
    }),
  ]);

  assert.deepEqual(resultados.map((resultado) => resultado.reutilizada).sort(), [false, true]);
  assert.equal(new Set(resultados.map((resultado) => resultado.cobro.id)).size, 1);
  assert.equal(kit.simuladorDeCobro.cantidadLlamadas, 1);
  assert.equal(kit.repositorioCobros.instantaneaMemoria().size, 1);
});

test('dos finalizaciones simultáneas con claves distintas cobran una sola vez', async () => {
  const kit = crearKitViajes();
  const { viaje, chofer } = await kit.crearViajeAsignado();

  const resultados = await Promise.allSettled([
    kit.finalizarViaje({
      viajeId: viaje.id,
      choferId: chofer.usuarioId,
      claveIdempotencia: 'carrera-a',
    }),
    kit.finalizarViaje({
      viajeId: viaje.id,
      choferId: chofer.usuarioId,
      claveIdempotencia: 'carrera-b',
    }),
  ]);

  const exitosos = resultados.filter((resultado) => resultado.status === 'fulfilled');
  const rechazados = resultados.filter((resultado) => resultado.status === 'rejected');

  assert.equal(exitosos.length, 1);
  assert.equal(rechazados.length, 1);
  assert.equal(rechazados[0].reason.codigo, 'TRANSICION_INVALIDA');
  assert.equal(kit.simuladorDeCobro.cantidadLlamadas, 1);
  assert.equal(kit.repositorioCobros.instantaneaMemoria().size, 1);
});

test('una clave vencida no reproduce la respuesta y el viaje ya finalizado no se cobra de nuevo', async () => {
  const kit = crearKitViajes({ ttlIdempotenciaMs: 1000 });
  const { viaje, chofer } = await kit.crearViajeAsignado();

  await kit.finalizarViaje({
    viajeId: viaje.id,
    choferId: chofer.usuarioId,
    claveIdempotencia: 'vencida',
  });

  kit.reloj.avanzar(2000);

  await assert.rejects(
    () =>
      kit.finalizarViaje({
        viajeId: viaje.id,
        choferId: chofer.usuarioId,
        claveIdempotencia: 'vencida',
      }),
    (error) => error.codigo === 'TRANSICION_INVALIDA',
  );

  assert.equal(kit.simuladorDeCobro.cantidadLlamadas, 1);
  assert.equal(kit.repositorioCobros.instantaneaMemoria().size, 1);
});

test('rechaza finalizar sin clave, con otro chofer o en un estado inválido', async () => {
  const kit = crearKitViajes();
  const { viaje, chofer } = await kit.crearViajeAsignado();

  await assert.rejects(
    () =>
      kit.finalizarViaje({
        viajeId: viaje.id,
        choferId: chofer.usuarioId,
      }),
    (error) => error.codigo === 'CLAVE_DE_IDEMPOTENCIA_REQUERIDA',
  );

  await assert.rejects(
    () =>
      kit.finalizarViaje({
        viajeId: viaje.id,
        choferId: kit.crearPasajero(),
        claveIdempotencia: 'otro-chofer',
      }),
    (error) => error.codigo === 'NO_AUTORIZADO',
  );

  await kit.finalizarViaje({
    viajeId: viaje.id,
    choferId: chofer.usuarioId,
    claveIdempotencia: 'primera',
  });

  await assert.rejects(
    () =>
      kit.finalizarViaje({
        viajeId: viaje.id,
        choferId: chofer.usuarioId,
        claveIdempotencia: 'segunda',
      }),
    (error) => error.codigo === 'TRANSICION_INVALIDA',
  );

  assert.equal(kit.simuladorDeCobro.cantidadLlamadas, 1);
  assert.equal(kit.repositorioCobros.instantaneaMemoria().size, 1);
});

test('el repositorio de cobros impone la unicidad natural por viaje', async () => {
  const kit = crearKitViajes();
  const { viaje } = await kit.crearViajeAsignado();

  const primero = new CobroSimulado({
    id: '00000000-0000-4000-8000-000000000020',
    viajeId: viaje.id,
    montoCentavos: viaje.precioFijadoCentavos,
    creadoEn: kit.reloj.ahora(),
  });
  const segundo = new CobroSimulado({
    id: '00000000-0000-4000-8000-000000000021',
    viajeId: viaje.id,
    montoCentavos: viaje.precioFijadoCentavos,
    creadoEn: kit.reloj.ahora(),
  });

  assert.equal(await kit.repositorioCobros.crear(primero), true);
  assert.equal(await kit.repositorioCobros.crear(segundo), false);
  assert.equal((await kit.repositorioCobros.buscarPorViajeId(viaje.id)).id, primero.id);
});
