import assert from 'node:assert/strict';
import test from 'node:test';

import { validarContrasena } from '../../../src/domain/value-objects/contrasena.js';

test('acepta una contraseña con longitud, letra y número', () => {
  assert.equal(validarContrasena('Segura123'), 'Segura123');
});

test('rechaza contraseñas cortas, sin letras o sin números', () => {
  assert.throws(() => validarContrasena('Ab1'), /al menos 8/i);
  assert.throws(() => validarContrasena('12345678'), /letra/i);
  assert.throws(() => validarContrasena('sololetras'), /número/i);
});

test('rechaza contraseñas que superan el límite de 72 bytes de bcrypt', () => {
  assert.throws(() => validarContrasena(`${'a'.repeat(71)}12`), /72 bytes/i);
});
