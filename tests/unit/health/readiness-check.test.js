import assert from 'node:assert/strict';
import test from 'node:test';

import { createReadinessCheck } from '../../../src/infrastructure/health/readiness-check.js';

test('readiness devuelve ok si todos los chequeos pasan', async () => {
  const readiness = createReadinessCheck({
    checks: {
      baseDeDatos: () => true,
      servicioExterno: async () => true,
    },
    timeoutMs: 100,
  });

  assert.deepEqual(await readiness(), {
    baseDeDatos: { ok: true },
    servicioExterno: { ok: true },
  });
});

test('readiness marca no disponible un chequeo que devuelve false', async () => {
  const readiness = createReadinessCheck({
    checks: {
      baseDeDatos: async () => false,
      reloj: () => true,
    },
    timeoutMs: 100,
  });

  const resultado = await readiness();

  assert.equal(resultado.baseDeDatos.ok, false);
  assert.equal(resultado.reloj.ok, true);
});

test('readiness captura excepciones de un chequeo', async () => {
  const readiness = createReadinessCheck({
    checks: {
      baseDeDatos: () => {
        throw new Error('sin conexión');
      },
    },
    timeoutMs: 100,
  });

  assert.deepEqual(await readiness(), { baseDeDatos: { ok: false } });
});

test('readiness aplica timeout a un chequeo colgado', async () => {
  const readiness = createReadinessCheck({
    checks: {
      colgado: () => new Promise(() => {}),
      reloj: () => true,
    },
    timeoutMs: 20,
  });

  const resultado = await readiness();

  assert.equal(resultado.colgado.ok, false);
  assert.equal(resultado.reloj.ok, true);
});
