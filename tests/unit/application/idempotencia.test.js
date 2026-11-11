import assert from 'node:assert/strict';
import test from 'node:test';

import { canonicalizar, huellaContenido } from '../../../src/application/services/idempotencia.js';

test('el orden de las propiedades no cambia la huella', () => {
  const a = { origen: { lat: 1, lng: 2 }, destino: { lat: 3, lng: 4 } };
  const b = { destino: { lng: 4, lat: 3 }, origen: { lng: 2, lat: 1 } };

  assert.equal(huellaContenido(a), huellaContenido(b));
  assert.equal(huellaContenido(a).length, 64);
});

test('un contenido distinto produce otra huella', () => {
  const a = { origen: { lat: 1, lng: 2 } };
  const b = { origen: { lat: 1, lng: 2.0001 } };

  assert.notEqual(huellaContenido(a), huellaContenido(b));
});

test('canonicaliza arrays y valores primitivos', () => {
  assert.deepEqual(canonicalizar([{ b: 2, a: 1 }, null]), [{ a: 1, b: 2 }, null]);
  assert.equal(canonicalizar('texto'), 'texto');
});
