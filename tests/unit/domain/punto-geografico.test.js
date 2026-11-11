import assert from 'node:assert/strict';
import test from 'node:test';

import { PuntoGeografico } from '../../../src/domain/value-objects/punto-geografico.js';

test('valida latitud y longitud', () => {
  assert.throws(
    () => new PuntoGeografico({ lat: 91, lng: 0 }),
    (error) => error.codigo === 'DATOS_INVALIDOS',
  );
  assert.throws(
    () => new PuntoGeografico({ lat: 0, lng: -181 }),
    (error) => error.codigo === 'DATOS_INVALIDOS',
  );
  assert.throws(
    () => new PuntoGeografico({ lat: '0', lng: 0 }),
    (error) => error.codigo === 'DATOS_INVALIDOS',
  );
});

test('la distancia entre el mismo punto es cero y entre puntos distintos es positiva', () => {
  const origen = new PuntoGeografico({ lat: -34.6037, lng: -58.3816 });
  const destino = new PuntoGeografico({ lat: -34.6083, lng: -58.3712 });

  assert.equal(origen.distanciaA(origen), 0);
  assert.equal(Math.round(origen.distanciaA(origen)), 0);
  assert.equal(origen.distanciaA(destino) > 500, true);
  assert.equal(origen.distanciaA(destino) < 2000, true);
  assert.deepEqual(origen.aJSON(), { lat: -34.6037, lng: -58.3816 });
});
