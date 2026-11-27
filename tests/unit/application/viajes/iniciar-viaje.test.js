import assert from 'node:assert/strict';
import test from 'node:test';

import { crearKitViajes } from '../../../helpers/viajes-kit.js';

test('el chofer asignado inicia el viaje y se fija iniciadoEn con el reloj del servidor', async () => {
  const kit = crearKitViajes();
  const { viaje, chofer } = await kit.crearViajeEnCamino();
  const ahora = kit.reloj.ahora().toISOString();

  const iniciado = await kit.iniciarViaje({
    viajeId: viaje.id,
    choferId: chofer.usuarioId,
  });

  assert.equal(iniciado.estado, 'EN_CURSO');
  assert.equal(iniciado.iniciadoEn.toISOString(), ahora);
  assert.equal(iniciado.cerradoEn, null);

  const guardado = await kit.repositorioViajes.buscarPorId(viaje.id);
  assert.equal(guardado.iniciadoEn.toISOString(), ahora);
});

test('un chofer ajeno no puede iniciar el viaje', async () => {
  const kit = crearKitViajes();
  const { viaje } = await kit.crearViajeEnCamino();
  const otroChofer = await kit.crearChofer();

  await assert.rejects(
    () =>
      kit.iniciarViaje({
        viajeId: viaje.id,
        choferId: otroChofer.usuarioId,
      }),
    (error) => error.codigo === 'NO_AUTORIZADO',
  );

  assert.equal((await kit.repositorioViajes.buscarPorId(viaje.id)).estado, 'CHOFER_EN_CAMINO');
});

test('no se puede iniciar un viaje inexistente, asignado o ya iniciado', async () => {
  const kit = crearKitViajes();

  await assert.rejects(
    () => kit.iniciarViaje({ viajeId: kit.crearPasajero(), choferId: kit.crearPasajero() }),
    (error) => error.codigo === 'NO_ENCONTRADO',
  );

  const asignado = await kit.crearViajeAsignado();

  await assert.rejects(
    () =>
      kit.iniciarViaje({
        viajeId: asignado.viaje.id,
        choferId: asignado.chofer.usuarioId,
      }),
    (error) => error.codigo === 'TRANSICION_INVALIDA',
  );

  const enCurso = await kit.crearViajeEnCurso();

  await assert.rejects(
    () =>
      kit.iniciarViaje({
        viajeId: enCurso.viaje.id,
        choferId: enCurso.chofer.usuarioId,
      }),
    (error) => error.codigo === 'TRANSICION_INVALIDA',
  );
});

test('dos inicios simultáneos dejan un solo ganador', async () => {
  const kit = crearKitViajes();
  const { viaje, chofer } = await kit.crearViajeEnCamino();

  const resultados = await Promise.allSettled([
    kit.iniciarViaje({ viajeId: viaje.id, choferId: chofer.usuarioId }),
    kit.iniciarViaje({ viajeId: viaje.id, choferId: chofer.usuarioId }),
  ]);

  const exitosos = resultados.filter((resultado) => resultado.status === 'fulfilled');
  const rechazados = resultados.filter((resultado) => resultado.status === 'rejected');

  assert.equal(exitosos.length, 1);
  assert.equal(rechazados.length, 1);
  assert.equal(rechazados[0].reason.codigo, 'TRANSICION_INVALIDA');
  assert.equal((await kit.repositorioViajes.buscarPorId(viaje.id)).estado, 'EN_CURSO');
});

test('iniciar contra la cancelación del chofer deja un solo resultado terminal', async () => {
  const kit = crearKitViajes();
  const { viaje, chofer } = await kit.crearViajeEnCamino();

  const resultados = await Promise.allSettled([
    kit.iniciarViaje({ viajeId: viaje.id, choferId: chofer.usuarioId }),
    kit.cancelarViaje({
      viajeId: viaje.id,
      actor: { usuarioId: chofer.usuarioId, rol: 'CHOFER' },
      motivo: 'No puedo continuar',
    }),
  ]);

  const exitosos = resultados.filter((resultado) => resultado.status === 'fulfilled');
  assert.equal(exitosos.length, 1);

  const guardado = await kit.repositorioViajes.buscarPorId(viaje.id);
  assert.equal(guardado.estado, exitosos[0].value.estado);
  assert.equal(['EN_CURSO', 'CANCELADO_POR_CHOFER'].includes(guardado.estado), true);

  if (guardado.estado === 'CANCELADO_POR_CHOFER') {
    const liberado = await kit.repositorioChoferes.buscarPorUsuarioId(chofer.usuarioId);
    assert.equal(liberado.viajeActivoId, null);
  } else {
    const ocupado = await kit.repositorioChoferes.buscarPorUsuarioId(chofer.usuarioId);
    assert.equal(ocupado.viajeActivoId, viaje.id);
  }
});
