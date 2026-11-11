import assert from 'node:assert/strict';
import test from 'node:test';

import { BcryptPasswordHasher } from '../../../src/infrastructure/adapters/out/security/bcrypt-password-hasher.js';
import { InMemoryPasswordHasher } from '../../../src/infrastructure/adapters/out/security/in-memory-password-hasher.js';

test('bcrypt hashea la contraseña y verifica sin guardar texto plano', async () => {
  const hasher = new BcryptPasswordHasher({ costo: 4 });

  const credencial = await hasher.hashear('Segura123');

  assert.notEqual(credencial, 'Segura123');
  assert.equal(credencial.startsWith('$2'), true);
  assert.equal(await hasher.verificar('Segura123', credencial), true);
  assert.equal(await hasher.verificar('Incorrecta123', credencial), false);
});

test('bcrypt devuelve false ante una credencial corrupta o vacía', async () => {
  const hasher = new BcryptPasswordHasher({ costo: 4 });

  assert.equal(await hasher.verificar('Segura123', 'no-es-un-hash'), false);
  assert.equal(await hasher.verificar('Segura123', ''), false);
  assert.equal(await hasher.verificar('Segura123', null), false);
});

test('el hasher en memoria mantiene el mismo contrato', async () => {
  const hasher = new InMemoryPasswordHasher();

  const credencial = await hasher.hashear('Segura123');

  assert.equal(credencial.startsWith('fake$'), true);
  assert.equal(await hasher.verificar('Segura123', credencial), true);
  assert.equal(await hasher.verificar('Otra123', credencial), false);
});
