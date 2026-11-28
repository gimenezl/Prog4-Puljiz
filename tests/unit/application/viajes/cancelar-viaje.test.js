import assert from 'node:assert/strict';
import test from 'node:test';

import { crearKitViajes } from '../../../helpers/viajes-kit.js';

function actorPasajero(viaje) {
  return { usuarioId: viaje.pasajeroId, rol: 'PASAJERO' };
}

function actorChofer(viaje) {
  return { usuarioId: viaje.choferId, rol: 'CHOFER' };
}

test('el pasajero dueño cancela un viaje solicitado', async () => {
  const kit = crearKitViajes();
  const { viaje } = await kit.crearViajeDePrueba();

  const cancelado = await kit.cancelarViaje({
    viajeId: viaje.id,
    actor: actorPasajero(viaje),
    motivo: 'Cambio de planes',
  });

  assert.equal(cancelado.estado, 'CANCELADO_POR_PASAJERO');
  assert.equal(cancelado.motivoCancelacion, 'Cambio de planes');
  assert.equal(cancelado.canceladoPorId, viaje.pasajeroId);
});

test('cancelar un viaje asignado libera al chofer en la misma operación', async () => {
  const kit = crearKitViajes();
  const { viaje } = await kit.crearViajeAsignado();

  const cancelado = await kit.cancelarViaje({
    viajeId: viaje.id,
    actor: actorPasajero(viaje),
    motivo: 'Me arrepentí',
  });

  assert.equal(cancelado.estado, 'CANCELADO_POR_PASAJERO');
  assert.equal(cancelado.choferId, viaje.choferId);

  const liberado = await kit.repositorioChoferes.buscarPorUsuarioId(viaje.choferId);
  assert.equal(liberado.viajeActivoId, null);
  assert.equal(liberado.estado, 'DISPONIBLE');
});

test('el pasajero puede cancelar con el chofer en camino y el chofer queda libre', async () => {
  const kit = crearKitViajes();
  const { viaje } = await kit.crearViajeEnCamino();

  const cancelado = await kit.cancelarViaje({
    viajeId: viaje.id,
    actor: actorPasajero(viaje),
    motivo: 'El chofer tardaba demasiado',
  });

  assert.equal(cancelado.estado, 'CANCELADO_POR_PASAJERO');
  assert.equal(cancelado.canceladoPorId, viaje.pasajeroId);

  const liberado = await kit.repositorioChoferes.buscarPorUsuarioId(viaje.choferId);
  assert.equal(liberado.viajeActivoId, null);
});

test('el chofer asignado cancela en asignado y en camino, conserva el historial y libera el perfil', async () => {
  const kit = crearKitViajes();
  const asignado = await kit.crearViajeAsignado();

  const cancelado = await kit.cancelarViaje({
    viajeId: asignado.viaje.id,
    actor: actorChofer(asignado.viaje),
    motivo: 'No puedo llegar',
  });

  assert.equal(cancelado.estado, 'CANCELADO_POR_CHOFER');
  assert.equal(cancelado.canceladoPorId, asignado.chofer.usuarioId);
  assert.equal(cancelado.choferId, asignado.chofer.usuarioId);

  const liberado = await kit.repositorioChoferes.buscarPorUsuarioId(asignado.chofer.usuarioId);
  assert.equal(liberado.viajeActivoId, null);

  const enCamino = await kit.crearViajeEnCamino();
  const canceladoEnCamino = await kit.cancelarViaje({
    viajeId: enCamino.viaje.id,
    actor: actorChofer(enCamino.viaje),
    motivo: 'Problema mecánico',
  });

  assert.equal(canceladoEnCamino.estado, 'CANCELADO_POR_CHOFER');
  assert.equal(canceladoEnCamino.choferId, enCamino.chofer.usuarioId);
  assert.equal(canceladoEnCamino.canceladoPorId, enCamino.chofer.usuarioId);
  assert.equal(canceladoEnCamino.motivoCancelacion, 'Problema mecánico');
  assert.equal(canceladoEnCamino.cerradoEn instanceof Date, true);

  const liberadoEnCamino = await kit.repositorioChoferes.buscarPorUsuarioId(
    enCamino.chofer.usuarioId,
  );
  assert.equal(liberadoEnCamino.viajeActivoId, null);
});

test('otro pasajero y otro chofer no pueden cancelar el viaje', async () => {
  const kit = crearKitViajes();
  const { viaje } = await kit.crearViajeAsignado();

  for (const actor of [
    { usuarioId: kit.crearPasajero(), rol: 'PASAJERO' },
    { usuarioId: kit.crearPasajero(), rol: 'CHOFER' },
  ]) {
    await assert.rejects(
      () =>
        kit.cancelarViaje({
          viajeId: viaje.id,
          actor,
          motivo: 'No es mío',
        }),
      (error) => error.codigo === 'NO_AUTORIZADO',
    );
  }

  assert.equal((await kit.repositorioViajes.buscarPorId(viaje.id)).estado, 'ASIGNADO');
});

test('el chofer no puede cancelar un viaje sin asignar ni uno en curso', async () => {
  const kit = crearKitViajes();
  const solicitado = await kit.crearViajeDePrueba();

  await assert.rejects(
    () =>
      kit.cancelarViaje({
        viajeId: solicitado.viaje.id,
        actor: { usuarioId: kit.crearPasajero(), rol: 'CHOFER' },
        motivo: 'No es mío',
      }),
    (error) => error.codigo === 'NO_AUTORIZADO',
  );

  const enCurso = await kit.crearViajeEnCurso();

  await assert.rejects(
    () =>
      kit.cancelarViaje({
        viajeId: enCurso.viaje.id,
        actor: actorChofer(enCurso.viaje),
        motivo: 'Ya arrancó',
      }),
    (error) => error.codigo === 'TRANSICION_INVALIDA',
  );
});

test('el pasajero no puede cancelar un viaje en curso', async () => {
  const kit = crearKitViajes();
  const { viaje } = await kit.crearViajeEnCurso();

  await assert.rejects(
    () =>
      kit.cancelarViaje({
        viajeId: viaje.id,
        actor: actorPasajero(viaje),
        motivo: 'Ya arrancó',
      }),
    (error) => error.codigo === 'TRANSICION_INVALIDA',
  );
});

test('un viaje terminal no se reabre', async () => {
  const kit = crearKitViajes();
  const { viaje } = await kit.crearViajeDePrueba();

  await kit.cancelarViaje({
    viajeId: viaje.id,
    actor: actorPasajero(viaje),
    motivo: 'Motivo',
  });

  await assert.rejects(
    () =>
      kit.cancelarViaje({
        viajeId: viaje.id,
        actor: actorPasajero(viaje),
        motivo: 'Otra vez',
      }),
    (error) => error.codigo === 'TRANSICION_INVALIDA',
  );
});

test('dos cancelaciones simultáneas dejan un solo estado terminal y liberan una sola vez', async () => {
  const kit = crearKitViajes();
  const { viaje } = await kit.crearViajeEnCamino();

  const resultados = await Promise.allSettled([
    kit.cancelarViaje({
      viajeId: viaje.id,
      actor: actorPasajero(viaje),
      motivo: 'Cancela el pasajero',
    }),
    kit.cancelarViaje({
      viajeId: viaje.id,
      actor: actorChofer(viaje),
      motivo: 'Cancela el chofer',
    }),
  ]);

  const exitosos = resultados.filter((resultado) => resultado.status === 'fulfilled');
  const rechazados = resultados.filter((resultado) => resultado.status === 'rejected');

  assert.equal(exitosos.length, 1);
  assert.equal(rechazados.length, 1);
  assert.equal(rechazados[0].reason.codigo, 'TRANSICION_INVALIDA');

  const guardado = await kit.repositorioViajes.buscarPorId(viaje.id);
  assert.equal(guardado.estado, exitosos[0].value.estado);
  assert.equal(guardado.canceladoPorId, exitosos[0].value.canceladoPorId);

  const liberado = await kit.repositorioChoferes.buscarPorUsuarioId(viaje.choferId);
  assert.equal(liberado.viajeActivoId, null);
});

test('una cancelación simultánea con la aceptación deja el viaje cancelado y al chofer libre', async () => {
  const kit = crearKitViajes();
  const { viaje } = await kit.crearViajeDePrueba();
  const chofer = await kit.crearChofer();

  const resultados = await Promise.allSettled([
    kit.aceptarViaje({ viajeId: viaje.id, choferId: chofer.usuarioId }),
    kit.cancelarViaje({
      viajeId: viaje.id,
      actor: actorPasajero(viaje),
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
      actor: actorPasajero(viaje),
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

test('rechaza motivos vacíos, solo espacios o demasiado largos sin persistir cambios', async () => {
  const kit = crearKitViajes();
  const { viaje } = await kit.crearViajeAsignado();
  const antes = (await kit.repositorioViajes.buscarPorId(viaje.id)).aVistaPublica();
  const choferAntes = (
    await kit.repositorioChoferes.buscarPorUsuarioId(viaje.choferId)
  ).aVistaPublica();

  for (const actor of [actorPasajero(viaje), actorChofer(viaje)]) {
    for (const motivo of ['', '   \t\n', 'x'.repeat(501)]) {
      await assert.rejects(
        () => kit.cancelarViaje({ viajeId: viaje.id, actor, motivo }),
        (error) => error.codigo === 'DATOS_INVALIDOS',
      );
    }
  }

  const guardado = await kit.repositorioViajes.buscarPorId(viaje.id);
  assert.deepEqual(guardado.aVistaPublica(), antes);
  assert.equal(guardado.motivoCancelacion, null);

  const choferGuardado = await kit.repositorioChoferes.buscarPorUsuarioId(viaje.choferId);
  assert.deepEqual(choferGuardado.aVistaPublica(), choferAntes);
  assert.equal(choferGuardado.viajeActivoId, viaje.id);

  const cancelado = await kit.cancelarViaje({
    viajeId: viaje.id,
    actor: actorPasajero(viaje),
    motivo: '  Motivo con espacios  ',
  });
  assert.equal(cancelado.motivoCancelacion, 'Motivo con espacios');
});

test('marcar en camino y cancelar el pasajero deja un estado coherente con el chofer', async () => {
  for (const orden of ['cancelar-primero', 'en-camino-primero']) {
    const kit = crearKitViajes();
    const { viaje, chofer } = await kit.crearViajeAsignado();

    const cancelar = () =>
      kit.cancelarViaje({
        viajeId: viaje.id,
        actor: actorPasajero(viaje),
        motivo: 'Cancelación concurrente',
      });
    const marcarEnCamino = () =>
      kit.marcarEnCamino({ viajeId: viaje.id, choferId: chofer.usuarioId });

    const resultados = await Promise.allSettled(
      orden === 'cancelar-primero'
        ? [cancelar(), marcarEnCamino()]
        : [marcarEnCamino(), cancelar()],
    );

    for (const rechazado of resultados.filter((resultado) => resultado.status === 'rejected')) {
      assert.equal(rechazado.reason.codigo, 'TRANSICION_INVALIDA');
    }

    const guardado = await kit.repositorioViajes.buscarPorId(viaje.id);
    const choferGuardado = await kit.repositorioChoferes.buscarPorUsuarioId(chofer.usuarioId);

    assert.ok(['CHOFER_EN_CAMINO', 'CANCELADO_POR_PASAJERO'].includes(guardado.estado), orden);

    if (guardado.estado === 'CHOFER_EN_CAMINO') {
      assert.equal(choferGuardado.viajeActivoId, viaje.id, orden);
    } else {
      assert.equal(choferGuardado.viajeActivoId, null, orden);
      assert.equal(guardado.canceladoPorId, viaje.pasajeroId, orden);
    }
  }
});

test('finalizar gana siempre la carrera contra la cancelación del chofer en curso', async () => {
  const kit = crearKitViajes();
  const { viaje, chofer } = await kit.crearViajeEnCurso();

  const resultados = await Promise.allSettled([
    kit.cancelarViaje({
      viajeId: viaje.id,
      actor: actorChofer(viaje),
      motivo: 'Intento de cancelar en curso',
    }),
    kit.finalizarViaje({
      viajeId: viaje.id,
      choferId: chofer.usuarioId,
      claveIdempotencia: 'finalizar-contra-cancelacion',
    }),
  ]);

  const cancelacion = resultados[0];
  const finalizacion = resultados[1];
  assert.equal(cancelacion.status, 'rejected');
  assert.equal(cancelacion.reason.codigo, 'TRANSICION_INVALIDA');
  assert.equal(finalizacion.status, 'fulfilled');
  assert.equal(finalizacion.value.viaje.estado, 'FINALIZADO');

  const guardado = await kit.repositorioViajes.buscarPorId(viaje.id);
  assert.equal(guardado.estado, 'FINALIZADO');
  assert.equal(guardado.cerradoEn instanceof Date, true);

  const cobro = await kit.repositorioCobros.buscarPorViajeId(viaje.id);
  assert.equal(cobro.estado, 'COBRADO');
  assert.equal(kit.simuladorDeCobro.cantidadLlamadas, 1);
  assert.equal(kit.repositorioCobros.instantaneaMemoria().size, 1);

  const choferGuardado = await kit.repositorioChoferes.buscarPorUsuarioId(chofer.usuarioId);
  assert.equal(choferGuardado.viajeActivoId, null);
  assert.equal(choferGuardado.estado, 'DISPONIBLE');
});

const SOPORTE = Object.freeze({
  usuarioId: '00000000-0000-4000-8000-000000000098',
  rol: 'OPERADOR_SOPORTE',
});

test('soporte cancela un viaje en curso, libera al chofer y queda como autor', async () => {
  const kit = crearKitViajes();
  const { viaje } = await kit.crearViajeEnCurso();
  assert.equal(viaje.estado, 'EN_CURSO');

  const cancelado = await kit.cancelarViaje({
    viajeId: viaje.id,
    actor: SOPORTE,
    motivo: 'Emergencia reportada por el pasajero',
  });

  assert.equal(cancelado.estado, 'CANCELADO_POR_SOPORTE');
  assert.equal(cancelado.canceladoPorId, SOPORTE.usuarioId);
  assert.equal(cancelado.choferId, viaje.choferId);

  const chofer = await kit.repositorioChoferes.buscarPorUsuarioId(viaje.choferId);
  assert.equal(chofer.viajeActivoId, null);
});

test('soporte cancela un viaje solicitado sin chofer', async () => {
  const kit = crearKitViajes();
  const { viaje } = await kit.crearViajeDePrueba();

  const cancelado = await kit.cancelarViaje({
    viajeId: viaje.id,
    actor: SOPORTE,
    motivo: 'Pedido duplicado',
  });

  assert.equal(cancelado.estado, 'CANCELADO_POR_SOPORTE');
  assert.equal(cancelado.choferId, null);
});

test('un administrador no puede cancelar aunque vea todos los viajes', async () => {
  const kit = crearKitViajes();
  const { viaje } = await kit.crearViajeDePrueba();

  await assert.rejects(
    () =>
      kit.cancelarViaje({
        viajeId: viaje.id,
        actor: { usuarioId: '00000000-0000-4000-8000-000000000099', rol: 'ADMINISTRADOR' },
        motivo: 'No corresponde',
      }),
    (error) => error.codigo === 'NO_AUTORIZADO',
  );
});
