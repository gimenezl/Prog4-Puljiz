import assert from 'node:assert/strict';
import test from 'node:test';

import { crearKitViajes } from '../../../helpers/viajes-kit.js';

const ADMIN = Object.freeze({
  usuarioId: '00000000-0000-4000-8000-000000000099',
  rol: 'ADMINISTRADOR',
});

test('un administrador habilita al chofer y el chofer declara disponibilidad', async () => {
  const kit = crearKitViajes();
  const chofer = await kit.crearChofer({ habilitado: false });

  const habilitado = await kit.habilitarChofer({
    usuarioId: chofer.usuarioId,
    solicitante: ADMIN,
    habilitado: true,
  });

  assert.equal(habilitado.habilitado, true);
  assert.equal(habilitado.disponible, false);

  const disponible = await kit.actualizarDisponibilidadChofer({
    usuarioId: chofer.usuarioId,
    solicitante: { usuarioId: chofer.usuarioId, rol: 'CHOFER' },
    disponible: true,
  });

  assert.equal(disponible.estado, 'DISPONIBLE');
  assert.equal(disponible.estaElegible(), true);
});

test('inhabilitar a un chofer lo deja no disponible', async () => {
  const kit = crearKitViajes();
  const chofer = await kit.crearChofer({ habilitado: true, disponible: true });

  const inhabilitado = await kit.habilitarChofer({
    usuarioId: chofer.usuarioId,
    solicitante: ADMIN,
    habilitado: false,
  });

  assert.equal(inhabilitado.habilitado, false);
  assert.equal(inhabilitado.disponible, false);
  assert.equal(inhabilitado.estado, 'INHABILITADO');
});

test('solo un administrador puede habilitar choferes', async () => {
  const kit = crearKitViajes();
  const chofer = await kit.crearChofer({ habilitado: false });

  await assert.rejects(
    () =>
      kit.habilitarChofer({
        usuarioId: chofer.usuarioId,
        solicitante: { usuarioId: chofer.usuarioId, rol: 'CHOFER' },
        habilitado: true,
      }),
    (error) => error.codigo === 'NO_AUTORIZADO',
  );
});

test('solo el propio chofer puede cambiar su disponibilidad', async () => {
  const kit = crearKitViajes();
  const chofer = await kit.crearChofer({ habilitado: true, disponible: false });
  const otro = await kit.crearChofer({ habilitado: true, disponible: false });

  await assert.rejects(
    () =>
      kit.actualizarDisponibilidadChofer({
        usuarioId: chofer.usuarioId,
        solicitante: { usuarioId: otro.usuarioId, rol: 'CHOFER' },
        disponible: true,
      }),
    (error) => error.codigo === 'NO_AUTORIZADO',
  );
});

test('un chofer inhabilitado no puede declararse disponible', async () => {
  const kit = crearKitViajes();
  const chofer = await kit.crearChofer({ habilitado: false });

  await assert.rejects(
    () =>
      kit.actualizarDisponibilidadChofer({
        usuarioId: chofer.usuarioId,
        solicitante: { usuarioId: chofer.usuarioId, rol: 'CHOFER' },
        disponible: true,
      }),
    (error) => error.codigo === 'CHOFER_NO_ELEGIBLE',
  );
});

test('listar disponibles exige un chofer elegible y devuelve los viajes solicitados', async () => {
  const kit = crearKitViajes();
  const disponible = await kit.crearChofer({ habilitado: true, disponible: true });
  const noDisponible = await kit.crearChofer({ habilitado: true, disponible: false });
  const primero = await kit.crearViajeDePrueba();
  const segundo = await kit.crearViajeDePrueba();

  const viajes = await kit.listarViajesDisponibles({ choferId: disponible.usuarioId });

  assert.deepEqual(
    viajes.map((viaje) => viaje.id).sort(),
    [primero.viaje.id, segundo.viaje.id].sort(),
  );

  await assert.rejects(
    () => kit.listarViajesDisponibles({ choferId: noDisponible.usuarioId }),
    (error) => error.codigo === 'CHOFER_NO_ELEGIBLE',
  );
});

test('obtener un viaje autoriza al pasajero, al chofer asignado y al administrador', async () => {
  const kit = crearKitViajes();
  const { viaje } = await kit.crearViajeDePrueba();
  const chofer = await kit.crearChofer();
  const ajeno = kit.crearPasajero();

  await assert.rejects(
    () =>
      kit.obtenerViaje({ viajeId: viaje.id, solicitante: { usuarioId: ajeno, rol: 'PASAJERO' } }),
    (error) => error.codigo === 'NO_AUTORIZADO',
  );

  const vistaPasajero = await kit.obtenerViaje({
    viajeId: viaje.id,
    solicitante: { usuarioId: viaje.pasajeroId, rol: 'PASAJERO' },
  });
  assert.equal(vistaPasajero.id, viaje.id);

  await kit.aceptarViaje({ viajeId: viaje.id, choferId: chofer.usuarioId });

  const vistaChofer = await kit.obtenerViaje({
    viajeId: viaje.id,
    solicitante: { usuarioId: chofer.usuarioId, rol: 'CHOFER' },
  });
  assert.equal(vistaChofer.choferId, chofer.usuarioId);

  const vistaAdmin = await kit.obtenerViaje({
    viajeId: viaje.id,
    solicitante: ADMIN,
  });
  assert.equal(vistaAdmin.id, viaje.id);
});

test('obtener el perfil de chofer respeta la propiedad y permite al administrador', async () => {
  const kit = crearKitViajes();
  const chofer = await kit.crearChofer({ habilitado: true });

  const propio = await kit.obtenerPerfilChofer({
    usuarioId: chofer.usuarioId,
    solicitante: { usuarioId: chofer.usuarioId, rol: 'CHOFER' },
  });
  assert.equal(propio.usuarioId, chofer.usuarioId);

  const ajeno = await kit.obtenerPerfilChofer({
    usuarioId: chofer.usuarioId,
    solicitante: ADMIN,
  });
  assert.equal(ajeno.usuarioId, chofer.usuarioId);

  await assert.rejects(
    () =>
      kit.obtenerPerfilChofer({
        usuarioId: chofer.usuarioId,
        solicitante: { usuarioId: kit.crearPasajero(), rol: 'PASAJERO' },
      }),
    (error) => error.codigo === 'NO_AUTORIZADO',
  );
});
