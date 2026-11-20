import assert from 'node:assert/strict';
import test from 'node:test';

import { calcularPrecio } from '../../../src/domain/services/precio.js';

const TARIFA = Object.freeze({
  baseCentavos: 100000,
  porKmCentavos: 50000,
  porMinutoCentavos: 10000,
  precioMaximoCentavos: 1000000,
});

test('calcula base + kilómetros + minutos y aplica el multiplicador una sola vez', () => {
  assert.equal(
    calcularPrecio({ tarifa: TARIFA, distanciaM: 1000, tiempoS: 120, multiplicador: '1.50' }),
    255000,
  );
});

test('el denominador común evita redondeos parciales', () => {
  // 1 metro y 1 segundo dan fracciones exactas que solo se redondean al final.
  const resultado = calcularPrecio({
    tarifa: TARIFA,
    distanciaM: 1,
    tiempoS: 1,
    multiplicador: '1.0000',
  });
  assert.equal(Number.isInteger(resultado), true);
  assert.equal(resultado, 100217);
});

test('el tope se aplica al total, después del multiplicador', () => {
  const caro = calcularPrecio({
    tarifa: { ...TARIFA, precioMaximoCentavos: 200000 },
    distanciaM: 1000,
    tiempoS: 120,
    multiplicador: '2',
  });
  assert.equal(caro, 200000);
});

test('rechaza entradas inconsistentes', () => {
  assert.throws(
    () => calcularPrecio({ tarifa: TARIFA, distanciaM: -1, tiempoS: 1, multiplicador: '1' }),
    /distancia/,
  );
  assert.throws(
    () => calcularPrecio({ tarifa: TARIFA, distanciaM: 1, tiempoS: 1, multiplicador: '0.9' }),
    /multiplicador/,
  );
  assert.throws(
    () =>
      calcularPrecio({
        tarifa: { ...TARIFA, precioMaximoCentavos: 1 },
        distanciaM: 1,
        tiempoS: 1,
        multiplicador: '1',
      }),
    /precio máximo/,
  );
});
