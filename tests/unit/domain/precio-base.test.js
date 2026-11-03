import assert from 'node:assert/strict';
import test from 'node:test';

import { calcularPrecioBase } from '../../../src/domain/services/precio-base.js';

const TARIFA = {
  baseCentavos: 100000,
  porKmCentavos: 50000,
  minimoCentavos: 150000,
  maximoCentavos: 1000000,
};

test('cobra la base más el importe por kilómetro', () => {
  assert.equal(calcularPrecioBase({ distanciaM: 2000, tarifa: TARIFA }), 200000);
});

test('respeta el mínimo y el máximo de la tarifa', () => {
  assert.equal(calcularPrecioBase({ distanciaM: 100, tarifa: TARIFA }), 150000);
  assert.equal(calcularPrecioBase({ distanciaM: 100_000, tarifa: TARIFA }), 1000000);
});

test('redondea la distancia y rechaza tarifas inconsistentes', () => {
  assert.equal(calcularPrecioBase({ distanciaM: 1499, tarifa: TARIFA }), 174950);

  assert.throws(
    () =>
      calcularPrecioBase({ distanciaM: 1000, tarifa: { ...TARIFA, minimoCentavos: 2_000_000 } }),
    (error) => error.codigo === 'DATOS_INVALIDOS',
  );
});
