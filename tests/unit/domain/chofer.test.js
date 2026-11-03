import assert from 'node:assert/strict';
import test from 'node:test';

import { Chofer, ESTADOS_CHOFER } from '../../../src/domain/entities/chofer.js';

const CHOFER_ID = '00000000-0000-4000-8000-000000000010';
const VIAJE_ID = '00000000-0000-4000-8000-000000000020';

function crearChofer(sobrescrituras = {}) {
  return new Chofer({ usuarioId: CHOFER_ID, ...sobrescrituras });
}

test('un chofer recién registrado nace inhabilitado y no disponible', () => {
  const chofer = crearChofer();

  assert.equal(chofer.estado, ESTADOS_CHOFER.INHABILITADO);
  assert.equal(chofer.estaElegible(), false);
  assert.equal(chofer.disponible, false);
});

test('solo un chofer habilitado y disponible es elegible', () => {
  const habilitado = crearChofer().conHabilitacion(true);
  assert.equal(habilitado.estado, ESTADOS_CHOFER.NO_DISPONIBLE);
  assert.equal(habilitado.estaElegible(), false);

  const disponible = habilitado.conDisponibilidad(true);
  assert.equal(disponible.estado, ESTADOS_CHOFER.DISPONIBLE);
  assert.equal(disponible.estaElegible(), true);
});

test('ocupar y liberar mantiene el viaje activo como única fuente de verdad', () => {
  const ocupado = crearChofer({ habilitado: true, disponible: true }).ocupar(VIAJE_ID);

  assert.equal(ocupado.estado, ESTADOS_CHOFER.OCUPADO);
  assert.equal(ocupado.viajeActivoId, VIAJE_ID);
  assert.equal(ocupado.estaElegible(), false);

  assert.throws(
    () => ocupado.ocupar('00000000-0000-4000-8000-000000000021'),
    (error) => error.codigo === 'CHOFER_OCUPADO',
  );

  const liberado = ocupado.liberar('00000000-0000-4000-8000-000000000021');
  assert.equal(liberado.viajeActivoId, VIAJE_ID);

  assert.equal(ocupado.liberar(VIAJE_ID).estado, ESTADOS_CHOFER.DISPONIBLE);
});

test('inhabilitar fuerza disponibilidad falsa y conserva el viaje activo', () => {
  const ocupado = crearChofer({ habilitado: true, disponible: true }).ocupar(VIAJE_ID);
  const inhabilitado = ocupado.conHabilitacion(false);

  assert.equal(inhabilitado.habilitado, false);
  assert.equal(inhabilitado.disponible, false);
  assert.equal(inhabilitado.viajeActivoId, VIAJE_ID);
  assert.equal(inhabilitado.estado, ESTADOS_CHOFER.OCUPADO);
});

test('un chofer inhabilitado no puede declararse disponible ni aceptar', () => {
  assert.throws(
    () => crearChofer().conDisponibilidad(true),
    (error) => error.codigo === 'CHOFER_NO_ELEGIBLE',
  );

  assert.throws(
    () => crearChofer({ habilitado: true, disponible: false }).ocupar(VIAJE_ID),
    (error) => error.codigo === 'CHOFER_NO_ELEGIBLE',
  );

  assert.throws(
    () => new Chofer({ usuarioId: CHOFER_ID, habilitado: false, disponible: true }),
    (error) => error.codigo === 'DATOS_INVALIDOS',
  );
});
