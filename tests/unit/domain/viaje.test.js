import assert from 'node:assert/strict';
import test from 'node:test';

import { ESTADOS_VIAJE, Viaje } from '../../../src/domain/entities/viaje.js';
import { PuntoGeografico } from '../../../src/domain/value-objects/punto-geografico.js';

const ORIGEN = new PuntoGeografico({ lat: -34.6037, lng: -58.3816 });
const DESTINO = new PuntoGeografico({ lat: -34.6083, lng: -58.3712 });

function crearViaje(sobrescrituras = {}) {
  return new Viaje({
    id: '00000000-0000-4000-8000-000000000001',
    pasajeroId: '00000000-0000-4000-8000-000000000002',
    origen: ORIGEN,
    destino: DESTINO,
    distanciaEstimadaM: 1200,
    precioFijadoCentavos: 160000,
    estado: ESTADOS_VIAJE.SOLICITADO,
    solicitadoEn: new Date('2026-01-01T00:00:00.000Z'),
    ...sobrescrituras,
  });
}

test('crea un viaje solicitado sin chofer y con precio fijado por el servidor', () => {
  const viaje = crearViaje();

  assert.equal(viaje.estado, ESTADOS_VIAJE.SOLICITADO);
  assert.equal(viaje.choferId, null);
  assert.equal(viaje.precioFijadoCentavos, 160000);
  assert.equal(viaje.esTerminal(), false);
  assert.equal(viaje.esParticipante(viaje.pasajeroId), true);
});

test('asigna una sola vez el viaje a un chofer', () => {
  const viaje = crearViaje();
  const asignado = viaje.asignar('00000000-0000-4000-8000-000000000003', new Date());

  assert.equal(asignado.estado, ESTADOS_VIAJE.ASIGNADO);
  assert.equal(asignado.choferId, '00000000-0000-4000-8000-000000000003');
  assert.equal(asignado.asignadoEn instanceof Date, true);

  assert.throws(
    () => asignado.asignar('00000000-0000-4000-8000-000000000004', new Date()),
    (error) => error.codigo === 'VIAJE_NO_DISPONIBLE',
  );
});

test('el pasajero puede cancelar un viaje solicitado o asignado', () => {
  const canceladoSolicitado = crearViaje().cancelarPorPasajero(
    new Date('2026-01-01T00:05:00.000Z'),
    'Ya no lo necesito',
  );

  assert.equal(canceladoSolicitado.estado, ESTADOS_VIAJE.CANCELADO_POR_PASAJERO);
  assert.equal(canceladoSolicitado.motivoCancelacion, 'Ya no lo necesito');
  assert.equal(canceladoSolicitado.esTerminal(), true);

  const asignado = crearViaje().asignar('00000000-0000-4000-8000-000000000003', new Date());
  const canceladoAsignado = asignado.cancelarPorPasajero(new Date(), 'Cambio de planes');

  assert.equal(canceladoAsignado.estado, ESTADOS_VIAJE.CANCELADO_POR_PASAJERO);
  assert.equal(canceladoAsignado.choferId, asignado.choferId);
});

test('rechaza cancelar un viaje en estado terminal', () => {
  const cancelado = crearViaje().cancelarPorPasajero(new Date(), 'Motivo');

  assert.throws(
    () => cancelado.cancelarPorPasajero(new Date(), 'Otro motivo'),
    (error) => error.codigo === 'TRANSICION_INVALIDA',
  );
});

test('rechaza viajes sin distancia, sin motivo de cancelación o con chofer incoherente', () => {
  assert.throws(
    () => crearViaje({ distanciaEstimadaM: 0 }),
    (error) => error.codigo === 'DATOS_INVALIDOS',
  );

  assert.throws(
    () =>
      crearViaje({
        estado: ESTADOS_VIAJE.CANCELADO_POR_PASAJERO,
        cerradoEn: new Date(),
      }),
    (error) => error.codigo === 'DATOS_INVALIDOS',
  );

  assert.throws(
    () =>
      crearViaje({
        estado: ESTADOS_VIAJE.ASIGNADO,
        choferId: null,
      }),
    (error) => error.codigo === 'DATOS_INVALIDOS',
  );
});

test('la vista pública devuelve fechas ISO y puntos serializables', () => {
  const vista = crearViaje().aVistaPublica();

  assert.deepEqual(vista.origen, ORIGEN.aJSON());
  assert.equal(vista.solicitadoEn, '2026-01-01T00:00:00.000Z');
  assert.equal(vista.asignadoEn, null);
});
