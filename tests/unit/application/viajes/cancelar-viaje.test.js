import assert from 'node:assert/strict';
import test from 'node:test';

import { crearKitViajes } from '../../../helpers/viajes-kit.js';

test('el pasajero dueño cancela un viaje solicitado', async () => {
  const kit = crearKitViajes();
  const { viaje } = await kit.crearViajeDePrueba();

  const cancelado = await kit.cancelarViaje({
    viajeId: viaje.id,
    pasajeroId: viaje.pasajeroId,
    motivo: 'Cambio de planes',
  });

  assert.equal(cancelado.estado, 'CANCELADO_POR_PASAJERO');
  assert.equal(cancelado.motivoCancelacion, 'Cambio de planes');
  assert.equal(cancelado.canceladoPorId, viaje.pasajeroId);
});

test('cancelar un viaje asignado libera al chofer en la misma operación', async () => {
  const kit = crearKitViajes();
  const { viaje } = await kit.crearViajeDePrueba();
  const chofer = await kit.crearChofer();

  await kit.aceptarViaje({ viajeId: viaje.id, choferId: chofer.usuarioId });
  const cancelado = await kit.cancelarViaje({
    viajeId: viaje.id,
    pasajeroId: viaje.pasajeroId,
    motivo: 'Me arrepentí',
  });

  assert.equal(cancelado.estado, 'CANCELADO_POR_PASAJERO');
  assert.equal(cancelado.choferId, chofer.usuarioId);

  const liberado = await kit.repositorioChoferes.buscarPorUsuarioId(chofer.usuarioId);
  assert.equal(liberado.viajeActivoId, null);
  assert.equal(liberado.estado, 'DISPONIBLE');
});

test('otro pasajero no puede cancelar el viaje y un viaje terminal no se reabre', async () => {
  const kit = crearKitViajes();
  const { viaje } = await kit.crearViajeDePrueba();

  await assert.rejects(
    () =>
      kit.cancelarViaje({
        viajeId: viaje.id,
        pasajeroId: kit.crearPasajero(),
        motivo: 'No es mío',
      }),
    (error) => error.codigo === 'NO_AUTORIZADO',
  );

  await kit.cancelarViaje({
    viajeId: viaje.id,
    pasajeroId: viaje.pasajeroId,
    motivo: 'Motivo',
  });

  await assert.rejects(
    () =>
      kit.cancelarViaje({
        viajeId: viaje.id,
        pasajeroId: viaje.pasajeroId,
        motivo: 'Otra vez',
      }),
    (error) => error.codigo === 'TRANSICION_INVALIDA',
  );
});

test('una cancelación simultánea con la aceptación deja el viaje cancelado y al chofer libre', async () => {
  const kit = crearKitViajes();
  const { viaje } = await kit.crearViajeDePrueba();
  const chofer = await kit.crearChofer();

  const resultados = await Promise.allSettled([
    kit.aceptarViaje({ viajeId: viaje.id, choferId: chofer.usuarioId }),
    kit.cancelarViaje({
      viajeId: viaje.id,
      pasajeroId: viaje.pasajeroId,
      motivo: 'Cancelación concurrente',
    }),
  ]);

  assert.equal(resultados[0].status, 'fulfilled');
  assert.equal(resultados[1].status, 'fulfilled');

  const guardado = await kit.repositorioViajes.buscarPorId(viaje.id);
  assert.equal(guardado.estado, 'CANCELADO_POR_PASAJERO');

  const liberado = await kit.repositorioChoferes.buscarPorUsuarioId(chofer.usuarioId);
  assert.equal(liberado.viajeActivoId, null);
});

test('si la cancelación gana la carrera, la aceptación recibe VIAJE_NO_DISPONIBLE', async () => {
  const kit = crearKitViajes();
  const { viaje } = await kit.crearViajeDePrueba();
  const chofer = await kit.crearChofer();

  const resultados = await Promise.allSettled([
    kit.cancelarViaje({
      viajeId: viaje.id,
      pasajeroId: viaje.pasajeroId,
      motivo: 'Cancelo primero',
    }),
    kit.aceptarViaje({ viajeId: viaje.id, choferId: chofer.usuarioId }),
  ]);

  assert.equal(resultados[0].status, 'fulfilled');
  assert.equal(resultados[1].status, 'rejected');
  assert.equal(resultados[1].reason.codigo, 'VIAJE_NO_DISPONIBLE');

  const liberado = await kit.repositorioChoferes.buscarPorUsuarioId(chofer.usuarioId);
  assert.equal(liberado.viajeActivoId, null);
});
