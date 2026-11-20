import assert from 'node:assert/strict';
import test from 'node:test';

import { Vehiculo, normalizarPatente } from '../../../src/domain/entities/vehiculo.js';

const VEHICULO_ID = '00000000-0000-4000-8000-000000000030';
const CHOFER_ID = '00000000-0000-4000-8000-000000000010';

function crearVehiculo(sobrescrituras = {}) {
  return new Vehiculo({
    id: VEHICULO_ID,
    choferId: CHOFER_ID,
    patente: 'AB123CD',
    marca: 'Toyota',
    modelo: 'Etios',
    ...sobrescrituras,
  });
}

const esDatoInvalido = (error) => error.codigo === 'DATOS_INVALIDOS';

test('acepta los dos formatos de patente y los normaliza', () => {
  assert.equal(normalizarPatente('ab 123-cd'), 'AB123CD');
  assert.equal(normalizarPatente('abc-123'), 'ABC123');
  assert.equal(crearVehiculo({ patente: ' ab123cd ' }).patente, 'AB123CD');
});

test('rechaza patentes con formato inválido', () => {
  for (const patente of ['', 'A1', 'ABCD123', '123ABC', 'AB12CD3', 42, null]) {
    assert.throws(() => crearVehiculo({ patente }), esDatoInvalido, `aceptó ${patente}`);
  }
});

test('marca y modelo son obligatorios; año y color son opcionales', () => {
  const vehiculo = crearVehiculo();

  assert.equal(vehiculo.anio, null);
  assert.equal(vehiculo.color, null);

  assert.throws(() => crearVehiculo({ marca: undefined }), esDatoInvalido);
  assert.throws(() => crearVehiculo({ modelo: '   ' }), esDatoInvalido);
  assert.throws(() => crearVehiculo({ color: 'x'.repeat(51) }), esDatoInvalido);
});

test('el año debe ser un entero dentro del rango plausible', () => {
  assert.equal(crearVehiculo({ anio: 2021 }).anio, 2021);

  for (const anio of [1949, 2101, 2021.5, '2021']) {
    assert.throws(() => crearVehiculo({ anio }), esDatoInvalido, `aceptó ${anio}`);
  }
});

test('editar devuelve una copia con el mismo id y chofer', () => {
  const original = crearVehiculo();
  const editado = original.conDatos({
    patente: 'ABC123',
    marca: 'Fiat',
    modelo: 'Cronos',
    anio: 2023,
    color: 'Gris',
  });

  assert.notEqual(editado, original);
  assert.equal(original.patente, 'AB123CD');
  assert.deepEqual(editado.aVistaPublica(), {
    id: VEHICULO_ID,
    choferId: CHOFER_ID,
    patente: 'ABC123',
    marca: 'Fiat',
    modelo: 'Cronos',
    anio: 2023,
    color: 'Gris',
  });
});
