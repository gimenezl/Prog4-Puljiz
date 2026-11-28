import assert from 'node:assert/strict';
import test from 'node:test';

import { ESTADOS_VIAJE, Viaje } from '../../../src/domain/entities/viaje.js';
import { PuntoGeografico } from '../../../src/domain/value-objects/punto-geografico.js';

const ORIGEN = new PuntoGeografico({ lat: -34.6037, lng: -58.3816 });
const DESTINO = new PuntoGeografico({ lat: -34.6083, lng: -58.3712 });
const CHOFER_ID = '00000000-0000-4000-8000-000000000003';
const FECHA_CIERRE = new Date('2026-01-01T00:05:00.000Z');

const ESTADOS_CON_CHOFER = new Set([
  ESTADOS_VIAJE.ASIGNADO,
  ESTADOS_VIAJE.CHOFER_EN_CAMINO,
  ESTADOS_VIAJE.EN_CURSO,
  ESTADOS_VIAJE.CANCELADO_POR_CHOFER,
  ESTADOS_VIAJE.FINALIZADO,
]);
const ESTADOS_CANCELADOS = new Set([
  ESTADOS_VIAJE.CANCELADO_POR_PASAJERO,
  ESTADOS_VIAJE.CANCELADO_POR_CHOFER,
  ESTADOS_VIAJE.CANCELADO_POR_SOPORTE,
]);

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

function crearViajeEnEstado(estado, sobrescrituras = {}) {
  const conChofer = ESTADOS_CON_CHOFER.has(estado);
  const cancelado = ESTADOS_CANCELADOS.has(estado);

  return crearViaje({
    estado,
    choferId: conChofer ? CHOFER_ID : null,
    asignadoEn: conChofer ? FECHA_CIERRE : null,
    iniciadoEn:
      estado === ESTADOS_VIAJE.EN_CURSO || estado === ESTADOS_VIAJE.FINALIZADO
        ? FECHA_CIERRE
        : null,
    cerradoEn: cancelado || estado === ESTADOS_VIAJE.FINALIZADO ? FECHA_CIERRE : null,
    canceladoPorId: cancelado ? CHOFER_ID : null,
    motivoCancelacion: cancelado ? 'Motivo de prueba' : null,
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
  assert.equal(vista.iniciadoEn, null);
});

test('el chofer asignado marca en camino, inicia y finaliza el viaje', () => {
  const choferId = '00000000-0000-4000-8000-000000000003';
  const asignado = crearViaje().asignar(choferId, new Date('2026-01-01T00:01:00.000Z'));
  const enCamino = asignado.marcarEnCamino();

  assert.equal(enCamino.estado, ESTADOS_VIAJE.CHOFER_EN_CAMINO);
  assert.equal(enCamino.choferId, choferId);
  assert.equal(enCamino.asignadoEn.toISOString(), '2026-01-01T00:01:00.000Z');
  assert.equal(enCamino.iniciadoEn, null);

  const iniciado = enCamino.iniciar(new Date('2026-01-01T00:02:00.000Z'));

  assert.equal(iniciado.estado, ESTADOS_VIAJE.EN_CURSO);
  assert.equal(iniciado.iniciadoEn.toISOString(), '2026-01-01T00:02:00.000Z');
  assert.equal(iniciado.cerradoEn, null);

  const finalizado = iniciado.finalizar(new Date('2026-01-01T00:10:00.000Z'));

  assert.equal(finalizado.estado, ESTADOS_VIAJE.FINALIZADO);
  assert.equal(finalizado.iniciadoEn.toISOString(), '2026-01-01T00:02:00.000Z');
  assert.equal(finalizado.cerradoEn.toISOString(), '2026-01-01T00:10:00.000Z');
  assert.equal(finalizado.esTerminal(), true);
});

test('el pasajero puede cancelar con el chofer en camino', () => {
  const asignado = crearViaje().asignar('00000000-0000-4000-8000-000000000003', new Date());
  const cancelado = asignado.marcarEnCamino().cancelarPorPasajero(new Date(), 'Cambio de planes');

  assert.equal(cancelado.estado, ESTADOS_VIAJE.CANCELADO_POR_PASAJERO);
  assert.equal(cancelado.canceladoPorId, cancelado.pasajeroId);
  assert.equal(cancelado.choferId, asignado.choferId);
});

test('el chofer asignado puede cancelar en asignado o en camino y conserva el historial', () => {
  const choferId = '00000000-0000-4000-8000-000000000003';
  const asignado = crearViaje().asignar(choferId, new Date());
  const canceladoAsignado = asignado.cancelarPorChofer(new Date(), 'No puedo llegar');

  assert.equal(canceladoAsignado.estado, ESTADOS_VIAJE.CANCELADO_POR_CHOFER);
  assert.equal(canceladoAsignado.canceladoPorId, choferId);
  assert.equal(canceladoAsignado.choferId, choferId);
  assert.equal(canceladoAsignado.motivoCancelacion, 'No puedo llegar');

  const canceladoEnCamino = asignado
    .marcarEnCamino()
    .cancelarPorChofer(new Date(), 'Problema mecánico');
  assert.equal(canceladoEnCamino.estado, ESTADOS_VIAJE.CANCELADO_POR_CHOFER);
});

test('rechaza las transiciones inválidas sin mutar el viaje', () => {
  const solicitado = crearViaje();
  const asignado = solicitado.asignar(CHOFER_ID, new Date());
  const enCamino = asignado.marcarEnCamino();
  const enCurso = enCamino.iniciar(new Date());
  const finalizado = enCurso.finalizar(new Date());
  const canceladoPasajero = crearViajeEnEstado(ESTADOS_VIAJE.CANCELADO_POR_PASAJERO);
  const canceladoChofer = crearViajeEnEstado(ESTADOS_VIAJE.CANCELADO_POR_CHOFER);
  const canceladoSoporte = crearViajeEnEstado(ESTADOS_VIAJE.CANCELADO_POR_SOPORTE);
  const sinChoferes = crearViajeEnEstado(ESTADOS_VIAJE.SIN_CHOFERES_DISPONIBLES);

  const casos = [
    ['marcar en camino desde SOLICITADO', solicitado, () => solicitado.marcarEnCamino()],
    ['marcar en camino desde EN_CURSO', enCurso, () => enCurso.marcarEnCamino()],
    ['marcar en camino desde FINALIZADO', finalizado, () => finalizado.marcarEnCamino()],
    [
      'marcar en camino desde CANCELADO_POR_PASAJERO',
      canceladoPasajero,
      () => canceladoPasajero.marcarEnCamino(),
    ],
    [
      'marcar en camino desde CANCELADO_POR_CHOFER',
      canceladoChofer,
      () => canceladoChofer.marcarEnCamino(),
    ],
    [
      'marcar en camino desde SIN_CHOFERES_DISPONIBLES',
      sinChoferes,
      () => sinChoferes.marcarEnCamino(),
    ],
    ['iniciar desde SOLICITADO', solicitado, () => solicitado.iniciar(new Date())],
    ['iniciar desde ASIGNADO', asignado, () => asignado.iniciar(new Date())],
    ['iniciar desde EN_CURSO', enCurso, () => enCurso.iniciar(new Date())],
    ['iniciar desde FINALIZADO', finalizado, () => finalizado.iniciar(new Date())],
    [
      'iniciar desde CANCELADO_POR_PASAJERO',
      canceladoPasajero,
      () => canceladoPasajero.iniciar(new Date()),
    ],
    [
      'iniciar desde CANCELADO_POR_CHOFER',
      canceladoChofer,
      () => canceladoChofer.iniciar(new Date()),
    ],
    [
      'iniciar desde CANCELADO_POR_SOPORTE',
      canceladoSoporte,
      () => canceladoSoporte.iniciar(new Date()),
    ],
    ['iniciar desde SIN_CHOFERES_DISPONIBLES', sinChoferes, () => sinChoferes.iniciar(new Date())],
    ['finalizar desde SOLICITADO', solicitado, () => solicitado.finalizar(new Date())],
    ['finalizar desde ASIGNADO', asignado, () => asignado.finalizar(new Date())],
    ['finalizar desde CHOFER_EN_CAMINO', enCamino, () => enCamino.finalizar(new Date())],
    ['finalizar desde FINALIZADO', finalizado, () => finalizado.finalizar(new Date())],
    [
      'finalizar desde CANCELADO_POR_PASAJERO',
      canceladoPasajero,
      () => canceladoPasajero.finalizar(new Date()),
    ],
    [
      'finalizar desde CANCELADO_POR_CHOFER',
      canceladoChofer,
      () => canceladoChofer.finalizar(new Date()),
    ],
    [
      'finalizar desde CANCELADO_POR_SOPORTE',
      canceladoSoporte,
      () => canceladoSoporte.finalizar(new Date()),
    ],
    [
      'cancelar por chofer desde SOLICITADO',
      solicitado,
      () => solicitado.cancelarPorChofer(new Date(), 'X'),
    ],
    [
      'cancelar por chofer desde EN_CURSO',
      enCurso,
      () => enCurso.cancelarPorChofer(new Date(), 'X'),
    ],
    [
      'cancelar por chofer desde FINALIZADO',
      finalizado,
      () => finalizado.cancelarPorChofer(new Date(), 'X'),
    ],
    [
      'cancelar por chofer desde CANCELADO_POR_PASAJERO',
      crearViajeEnEstado(ESTADOS_VIAJE.CANCELADO_POR_PASAJERO, { choferId: CHOFER_ID }),
      (viaje) => viaje.cancelarPorChofer(new Date(), 'X'),
    ],
    [
      'cancelar por chofer desde CANCELADO_POR_CHOFER',
      canceladoChofer,
      () => canceladoChofer.cancelarPorChofer(new Date(), 'X'),
    ],
    [
      'cancelar por chofer desde CANCELADO_POR_SOPORTE',
      crearViajeEnEstado(ESTADOS_VIAJE.CANCELADO_POR_SOPORTE, { choferId: CHOFER_ID }),
      (viaje) => viaje.cancelarPorChofer(new Date(), 'X'),
    ],
    [
      'cancelar por chofer desde SIN_CHOFERES_DISPONIBLES',
      sinChoferes,
      () => sinChoferes.cancelarPorChofer(new Date(), 'X'),
    ],
    [
      'cancelar por pasajero desde EN_CURSO',
      enCurso,
      () => enCurso.cancelarPorPasajero(new Date(), 'X'),
    ],
    [
      'cancelar por pasajero desde FINALIZADO',
      finalizado,
      () => finalizado.cancelarPorPasajero(new Date(), 'X'),
    ],
    [
      'cancelar por pasajero desde SIN_CHOFERES_DISPONIBLES',
      sinChoferes,
      () => sinChoferes.cancelarPorPasajero(new Date(), 'X'),
    ],
  ];

  for (const [descripcion, viaje, operacion] of casos) {
    const antes = viaje.aVistaPublica();

    assert.throws(
      () => operacion(viaje),
      (error) => error.codigo === 'TRANSICION_INVALIDA',
      descripcion,
    );
    assert.deepEqual(viaje.aVistaPublica(), antes, descripcion);
  }
});

test('el constructor exige fecha de inicio para EN_CURSO y FINALIZADO', () => {
  const choferId = '00000000-0000-4000-8000-000000000003';

  for (const estado of [ESTADOS_VIAJE.EN_CURSO, ESTADOS_VIAJE.FINALIZADO]) {
    assert.throws(
      () => crearViaje({ estado, choferId }),
      (error) => error.codigo === 'DATOS_INVALIDOS',
    );
  }

  const enCurso = crearViaje({
    estado: ESTADOS_VIAJE.EN_CURSO,
    choferId,
    iniciadoEn: new Date('2026-01-01T00:02:00.000Z'),
  });
  assert.equal(enCurso.iniciadoEn.toISOString(), '2026-01-01T00:02:00.000Z');
});

test('rechaza motivos de cancelación vacíos, solo espacios o con más de 500 caracteres', () => {
  const asignado = crearViaje().asignar(CHOFER_ID, new Date());

  for (const motivo of ['', '   \t\n', 'x'.repeat(501)]) {
    assert.throws(
      () => crearViajeEnEstado(ESTADOS_VIAJE.CANCELADO_POR_PASAJERO, { motivoCancelacion: motivo }),
      (error) => error.codigo === 'DATOS_INVALIDOS',
    );
    assert.throws(
      () => crearViaje().cancelarPorPasajero(new Date(), motivo),
      (error) => error.codigo === 'DATOS_INVALIDOS',
    );
    assert.throws(
      () => asignado.cancelarPorChofer(new Date(), motivo),
      (error) => error.codigo === 'DATOS_INVALIDOS',
    );
  }
});

test('acepta motivos recortados con trim y de hasta 500 caracteres', () => {
  const motivo = 'Cambio de planes';
  const limite = 'x'.repeat(500);

  const canceladoPasajero = crearViaje().cancelarPorPasajero(new Date(), `  ${motivo}  `);
  assert.equal(canceladoPasajero.motivoCancelacion, motivo);

  const canceladoChofer = crearViaje()
    .asignar(CHOFER_ID, new Date())
    .cancelarPorChofer(new Date(), `\t${motivo}\n`);
  assert.equal(canceladoChofer.motivoCancelacion, motivo);

  const enLimite = crearViajeEnEstado(ESTADOS_VIAJE.CANCELADO_POR_SOPORTE, {
    motivoCancelacion: ` ${limite} `,
  });
  assert.equal(enLimite.motivoCancelacion, limite);
  assert.equal(enLimite.motivoCancelacion.length, 500);
});

test('esTerminal distingue los cuatro estados activos de los cinco terminales', () => {
  const terminales = new Set([
    ESTADOS_VIAJE.FINALIZADO,
    ESTADOS_VIAJE.CANCELADO_POR_PASAJERO,
    ESTADOS_VIAJE.CANCELADO_POR_CHOFER,
    ESTADOS_VIAJE.CANCELADO_POR_SOPORTE,
    ESTADOS_VIAJE.SIN_CHOFERES_DISPONIBLES,
  ]);

  for (const estado of Object.values(ESTADOS_VIAJE)) {
    assert.equal(
      crearViajeEnEstado(estado).esTerminal(),
      terminales.has(estado),
      `esTerminal para ${estado}`,
    );
  }
});

test('el constructor admite CHOFER_EN_CAMINO con chofer y sin fecha de inicio', () => {
  const enCamino = crearViajeEnEstado(ESTADOS_VIAJE.CHOFER_EN_CAMINO);

  assert.equal(enCamino.estado, ESTADOS_VIAJE.CHOFER_EN_CAMINO);
  assert.equal(enCamino.choferId, CHOFER_ID);
  assert.equal(enCamino.iniciadoEn, null);
  assert.equal(enCamino.aVistaPublica().iniciadoEn, null);
  assert.equal(enCamino.esTerminal(), false);

  const iniciado = enCamino.iniciar(new Date('2026-01-01T00:06:00.000Z'));
  assert.equal(iniciado.estado, ESTADOS_VIAJE.EN_CURSO);
  assert.equal(iniciado.iniciadoEn.toISOString(), '2026-01-01T00:06:00.000Z');
});

test('soporte puede cancelar en cualquier estado activo, incluido EN_CURSO', () => {
  const soporteId = '00000000-0000-4000-8000-000000000009';

  for (const estado of [
    ESTADOS_VIAJE.SOLICITADO,
    ESTADOS_VIAJE.ASIGNADO,
    ESTADOS_VIAJE.CHOFER_EN_CAMINO,
    ESTADOS_VIAJE.EN_CURSO,
  ]) {
    const original = crearViajeEnEstado(estado);
    const cancelado = original.cancelarPorSoporte(
      FECHA_CIERRE,
      '  Reclamo del pasajero  ',
      soporteId,
    );

    assert.equal(cancelado.estado, ESTADOS_VIAJE.CANCELADO_POR_SOPORTE, estado);
    assert.equal(cancelado.canceladoPorId, soporteId);
    assert.equal(cancelado.motivoCancelacion, 'Reclamo del pasajero');
    assert.equal(cancelado.cerradoEn.toISOString(), FECHA_CIERRE.toISOString());
    // El chofer queda como historial y el original no cambia.
    assert.equal(cancelado.choferId, original.choferId);
    assert.equal(original.estado, estado);
  }
});

test('soporte no puede cancelar un viaje terminado ni sin motivo', () => {
  const soporteId = '00000000-0000-4000-8000-000000000009';

  for (const estado of [
    ESTADOS_VIAJE.FINALIZADO,
    ESTADOS_VIAJE.CANCELADO_POR_PASAJERO,
    ESTADOS_VIAJE.CANCELADO_POR_CHOFER,
    ESTADOS_VIAJE.CANCELADO_POR_SOPORTE,
    ESTADOS_VIAJE.SIN_CHOFERES_DISPONIBLES,
  ]) {
    assert.throws(
      () => crearViajeEnEstado(estado).cancelarPorSoporte(FECHA_CIERRE, 'X', soporteId),
      (error) => error.codigo === 'TRANSICION_INVALIDA',
      estado,
    );
  }

  assert.throws(
    () => crearViaje().cancelarPorSoporte(FECHA_CIERRE, '   ', soporteId),
    (error) => error.codigo === 'DATOS_INVALIDOS',
  );
});
