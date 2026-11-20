import assert from 'node:assert/strict';
import test from 'node:test';

import {
  aEnteroEscalado,
  desdeEnteroEscalado,
  redondearMitadArriba,
} from '../../../src/domain/services/decimal-exacto.js';
import { calcularMultiplicador } from '../../../src/domain/services/multiplicador.js';

const REGLA = Object.freeze({
  formula: 'LINEAL_POR_TRAMOS',
  umbralInferior: '0.5',
  umbralSuperior: '3',
  multiplicadorMinimo: '1',
  multiplicadorMaximo: '2',
  escalaMultiplicador: 2,
});

function calcular(solicitudes, choferes, cambios = {}) {
  return calcularMultiplicador({
    regla: { ...REGLA, ...cambios },
    solicitudes,
    choferesDisponibles: choferes,
  });
}

test('el decimal escalado es exacto y el redondeo es mitad hacia arriba', () => {
  assert.equal(aEnteroEscalado('1.5'), 15000n);
  assert.equal(desdeEnteroEscalado(15000n), '1.5000');
  assert.equal(redondearMitadArriba(5n, 2n), 3n);
  assert.equal(redondearMitadArriba(4n, 2n), 2n);
  assert.throws(() => aEnteroEscalado('1.12345'), /no puede tener más de 4 decimales/);
});

test('demanda baja fija el mínimo y demanda alta fija el máximo', () => {
  assert.equal(calcular(0, 4), '1.00');
  assert.equal(calcular(1, 4), '1.00');
  assert.equal(calcular(13, 4), '2.00');
  assert.equal(calcular(100, 4), '2.00');
});

test('los umbrales son cerrados y el tramo es lineal', () => {
  // 2/4 = 0.5 (mínimo) y 12/4 = 3 (máximo).
  assert.equal(calcular(2, 4), '1.00');
  assert.equal(calcular(12, 4), '2.00');
  // 7/4 = 1.75, a mitad del tramo 0.5..3.
  assert.equal(calcular(7, 4), '1.50');
});

test('0/0 usa el mínimo y cualquier demanda sin choferes usa el máximo', () => {
  assert.equal(calcular(0, 0), '1.00');
  assert.equal(calcular(1, 0), '2.00');
});

test('el multiplicador es monótono creciente con la demanda', () => {
  const valores = [0, 1, 2, 3, 4, 5, 6, 7, 8, 12, 20].map((solicitudes) =>
    Number(calcular(solicitudes, 4)),
  );

  for (let i = 1; i < valores.length; i += 1) {
    assert.equal(valores[i] >= valores[i - 1], true, `${valores[i - 1]} -> ${valores[i]}`);
  }
});

test('el resultado se acota y respeta la escala de la regla', () => {
  assert.equal(calcular(0, 4, { escalaMultiplicador: 0 }), '1');
  assert.equal(calcular(100, 4, { escalaMultiplicador: 0 }), '2');
  assert.equal(calcular(7, 4, { escalaMultiplicador: 4 }), '1.5000');

  const limite = calcular(6, 4, { escalaMultiplicador: 2 });
  assert.match(limite, /^\d+\.\d{2}$/);
  assert.equal(Number(limite) >= 1 && Number(limite) <= 2, true);
});

test('rechaza reglas y conteos inválidos', () => {
  assert.throws(() => calcular(-1, 4), /cantidad de solicitudes/);
  assert.throws(() => calcular(1, -1), /cantidad de choferes/);
  assert.throws(() => calcular(1, 4, { umbralSuperior: '0.5' }), /umbrales/);
  assert.throws(() => calcular(1, 4, { multiplicadorMinimo: '0.5' }), /rango/);
  assert.throws(() => calcular(1, 4, { formula: 'OTRA' }), /fórmula/);
});
