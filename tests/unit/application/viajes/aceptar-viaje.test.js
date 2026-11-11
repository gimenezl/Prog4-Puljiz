import assert from 'node:assert/strict';
import test from 'node:test';

import { crearKitViajes } from '../../../helpers/viajes-kit.js';

test('un chofer elegible acepta el viaje y queda ocupado', async () => {
  const kit = crearKitViajes();
  const { viaje } = await kit.crearViajeDePrueba();
  const chofer = await kit.crearChofer();

  const aceptado = await kit.aceptarViaje({
    viajeId: viaje.id,
    choferId: chofer.usuarioId,
  });

  assert.equal(aceptado.estado, 'ASIGNADO');
  assert.equal(aceptado.choferId, chofer.usuarioId);

  const guardado = await kit.repositorioChoferes.buscarPorUsuarioId(chofer.usuarioId);
  assert.equal(guardado.viajeActivoId, viaje.id);
  assert.equal(guardado.estado, 'OCUPADO');
});

test('un segundo chofer no puede aceptar el mismo viaje', async () => {
  const kit = crearKitViajes();
  const { viaje } = await kit.crearViajeDePrueba();
  const primero = await kit.crearChofer();
  const segundo = await kit.crearChofer();

  await kit.aceptarViaje({ viajeId: viaje.id, choferId: primero.usuarioId });

  await assert.rejects(
    () => kit.aceptarViaje({ viajeId: viaje.id, choferId: segundo.usuarioId }),
    (error) => error.codigo === 'VIAJE_NO_DISPONIBLE',
  );

  const guardado = await kit.repositorioChoferes.buscarPorUsuarioId(segundo.usuarioId);
  assert.equal(guardado.viajeActivoId, null);
});

test('cincuenta aceptaciones simultáneas del mismo viaje dejan exactamente un ganador', async () => {
  const kit = crearKitViajes();
  const { viaje } = await kit.crearViajeDePrueba();
  const choferes = await Promise.all(Array.from({ length: 50 }, () => kit.crearChofer()));

  const resultados = await Promise.allSettled(
    choferes.map((chofer) => kit.aceptarViaje({ viajeId: viaje.id, choferId: chofer.usuarioId })),
  );

  const exitosos = resultados.filter((resultado) => resultado.status === 'fulfilled');
  const rechazados = resultados.filter((resultado) => resultado.status === 'rejected');

  assert.equal(exitosos.length, 1);
  assert.equal(rechazados.length, 49);
  assert.equal(
    rechazados.every((resultado) => resultado.reason.codigo === 'VIAJE_NO_DISPONIBLE'),
    true,
  );

  const guardado = await kit.repositorioViajes.buscarPorId(viaje.id);
  assert.equal(guardado.estado, 'ASIGNADO');

  const ocupados = await Promise.all(
    choferes.map((chofer) => kit.repositorioChoferes.buscarPorUsuarioId(chofer.usuarioId)),
  );
  assert.equal(ocupados.filter((chofer) => chofer.viajeActivoId !== null).length, 1);
});

test('un chofer no puede aceptar dos viajes a la vez', async () => {
  const kit = crearKitViajes();
  const primero = await kit.crearViajeDePrueba();
  const segundo = await kit.crearViajeDePrueba();
  const chofer = await kit.crearChofer();

  const resultados = await Promise.allSettled([
    kit.aceptarViaje({ viajeId: primero.viaje.id, choferId: chofer.usuarioId }),
    kit.aceptarViaje({ viajeId: segundo.viaje.id, choferId: chofer.usuarioId }),
  ]);

  const exitosos = resultados.filter((resultado) => resultado.status === 'fulfilled');
  const rechazados = resultados.filter((resultado) => resultado.status === 'rejected');

  assert.equal(exitosos.length, 1);
  assert.equal(rechazados.length, 1);
  assert.equal(rechazados[0].reason.codigo, 'CHOFER_OCUPADO');

  const ganador = exitosos[0].value;
  const perdedor = ganador.id === primero.viaje.id ? segundo.viaje.id : primero.viaje.id;

  const viajePerdedor = await kit.repositorioViajes.buscarPorId(perdedor);
  assert.equal(viajePerdedor.estado, 'SOLICITADO');

  const guardado = await kit.repositorioChoferes.buscarPorUsuarioId(chofer.usuarioId);
  assert.equal(guardado.viajeActivoId, ganador.id);
});

test('rechaza choferes inhabilitados o no disponibles sin tocar el viaje', async () => {
  const kit = crearKitViajes();
  const { viaje } = await kit.crearViajeDePrueba();
  const inhabilitado = await kit.crearChofer({ habilitado: false });

  await assert.rejects(
    () => kit.aceptarViaje({ viajeId: viaje.id, choferId: inhabilitado.usuarioId }),
    (error) => error.codigo === 'CHOFER_NO_ELEGIBLE',
  );

  const noDisponible = await kit.crearChofer({ habilitado: true, disponible: false });

  await assert.rejects(
    () => kit.aceptarViaje({ viajeId: viaje.id, choferId: noDisponible.usuarioId }),
    (error) => error.codigo === 'CHOFER_NO_ELEGIBLE',
  );

  assert.equal((await kit.repositorioViajes.buscarPorId(viaje.id)).estado, 'SOLICITADO');
});
