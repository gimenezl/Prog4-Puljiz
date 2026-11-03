import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizarEmail } from '../../../src/domain/value-objects/email.js';

test('normaliza espacios y mayúsculas', () => {
  assert.equal(normalizarEmail('  Ana.Perez@Example.COM '), 'ana.perez@example.com');
});

test('rechaza valores que no son emails', () => {
  for (const valor of ['', 'sin-arroba', 'a@b', 'a b@c.com', null, 42]) {
    assert.throws(() => normalizarEmail(valor), /email/i);
  }
});
