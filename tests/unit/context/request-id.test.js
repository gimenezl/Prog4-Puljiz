import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizarRequestId } from '../../../src/infrastructure/context/request-id.js';

const FORMATO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

test('conserva un requestId con formato seguro', () => {
  assert.equal(normalizarRequestId('abc-123_ok:1'), 'abc-123_ok:1');
});

test('genera un UUID si el requestId está vacío o es inválido', () => {
  for (const valor of ['', 'con espacios', 'x'.repeat(129), undefined, ['a', 'b']]) {
    assert.match(normalizarRequestId(valor), FORMATO_UUID);
  }
});
