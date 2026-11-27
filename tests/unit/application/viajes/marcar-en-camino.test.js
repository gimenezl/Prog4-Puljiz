import assert from 'node:assert/strict';
import test from 'node:test';

import { crearKitViajes } from '../../../helpers/viajes-kit.js';

test('el chofer asignado marca el viaje en camino sin tocar las fechas', async () => {
  const kit = crearKitViajes();
  const { viaje, chofer } = await kit.crearViajeAsignado();
  const asignadoEn = viaje.asignadoEn.toISOString();

  const enCamino = await kit.marcarEnCamino({
    viajeId: viaje.id,
    choferId: chofer.usuarioId,
  });

  assert.equal(enCamino.estado, 'CHOFER_EN_CAMINO');
  assert.equal(enCamino.choferId, chofer.usuarioId);
  assert.equal(enCamino.asignadoEn.toISOString(), asignadoEn);
  assert.equal(enCamino.iniciadoEn, null);
  assert.equal(enCamino.cerradoEn, null);
});

test('un chofer ajeno no puede marcar el viaje en camino', async () => {
  const kit = crearKitViajes();
  const { viaje } = await kit.crearViajeAsignado();
  const otroChofer = await kit.crearChofer();

  await assert.rejects(
    () =>
      kit.marcarEnCamino({
        viajeId: viaje.id,
        choferId: otroChofer.usuarioId,
      }),
    (error) => error.codigo === 'NO_AUTORIZADO',
  );

  assert.equal((await kit.repositorioViajes.buscarPorId(viaje.id)).estado, 'ASIGNADO');
});

test('no se puede marcar en camino un viaje inexistente o en un estado inválido', async () => {
  const kit = crearKitViajes();

  await assert.rejects(
    () => kit.marcarEnCamino({ viajeId: kit.crearPasajero(), choferId: kit.crearPasajero() }),
    (error) => error.codigo === 'NO_ENCONTRADO',
  );

  const solicitado = await kit.crearViajeDePrueba();
  const chofer = await kit.crearChofer();

  await assert.rejects(
    () =>
      kit.marcarEnCamino({
        viajeId: solicitado.viaje.id,
        choferId: chofer.usuarioId,
      }),
    (error) => error.codigo === 'NO_AUTORIZADO',
  );

  const enCamino = await kit.crearViajeEnCamino();

  await assert.rejects(
    () =>
      kit.marcarEnCamino({
        viajeId: enCamino.viaje.id,
        choferId: enCamino.chofer.usuarioId,
      }),
    (error) => error.codigo === 'TRANSICION_INVALIDA',
  );
});

test('dos marcas en camino simultáneas dejan un solo ganador', async () => {
  const kit = crearKitViajes();
  const { viaje, chofer } = await kit.crearViajeAsignado();

  const resultados = await Promise.allSettled([
    kit.marcarEnCamino({ viajeId: viaje.id, choferId: chofer.usuarioId }),
    kit.marcarEnCamino({ viajeId: viaje.id, choferId: chofer.usuarioId }),
  ]);

  const exitosos = resultados.filter((resultado) => resultado.status === 'fulfilled');
  const rechazados = resultados.filter((resultado) => resultado.status === 'rejected');

  assert.equal(exitosos.length, 1);
  assert.equal(rechazados.length, 1);
  assert.equal(rechazados[0].reason.codigo, 'TRANSICION_INVALIDA');
  assert.equal((await kit.repositorioViajes.buscarPorId(viaje.id)).estado, 'CHOFER_EN_CAMINO');
});
