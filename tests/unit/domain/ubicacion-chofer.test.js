import assert from 'node:assert/strict';
import test from 'node:test';

import { UbicacionChofer } from '../../../src/domain/entities/ubicacion-chofer.js';

const CHOFER_ID = '00000000-0000-4000-8000-000000000010';
const RECIBIDA = new Date('2026-11-20T18:00:00.000Z');
const VIGENCIA_MS = 60_000;

function crearUbicacion(sobrescrituras = {}) {
  return new UbicacionChofer({
    choferId: CHOFER_ID,
    punto: { lat: -34.6037, lng: -58.3816 },
    actualizadaEn: RECIBIDA,
    ...sobrescrituras,
  });
}

const despues = (ms) => new Date(RECIBIDA.getTime() + ms);

test('expone el punto y la fecha de recepción', () => {
  assert.deepEqual(crearUbicacion().aVistaPublica(), {
    choferId: CHOFER_ID,
    punto: { lat: -34.6037, lng: -58.3816 },
    actualizadaEn: '2026-11-20T18:00:00.000Z',
  });
});

test('está vigente mientras su antigüedad sea menor que la vigencia', () => {
  const ubicacion = crearUbicacion();

  assert.equal(ubicacion.estaVigente(despues(0), VIGENCIA_MS), true);
  assert.equal(ubicacion.estaVigente(despues(59_999), VIGENCIA_MS), true);
  assert.equal(ubicacion.estaVigente(despues(60_000), VIGENCIA_MS), false);
  assert.equal(ubicacion.estaVigente(despues(120_000), VIGENCIA_MS), false);
});

test('rechaza coordenadas, chofer o fecha inválidos', () => {
  const esDatoInvalido = (error) => error.codigo === 'DATOS_INVALIDOS';

  assert.throws(() => crearUbicacion({ punto: { lat: 91, lng: 0 } }), esDatoInvalido);
  assert.throws(() => crearUbicacion({ punto: { lat: 0, lng: -181 } }), esDatoInvalido);
  assert.throws(() => crearUbicacion({ punto: undefined }), esDatoInvalido);
  assert.throws(() => crearUbicacion({ choferId: '' }), esDatoInvalido);
  assert.throws(() => crearUbicacion({ actualizadaEn: new Date('x') }), esDatoInvalido);
});
