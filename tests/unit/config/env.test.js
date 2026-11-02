import assert from 'node:assert/strict';
import test from 'node:test';

import { loadEnv } from '../../../src/infrastructure/config/env.js';

const ENTORNO_BASE = {
  NODE_ENV: 'test',
  HOST: '127.0.0.1',
  PORT: '3100',
  LOG_LEVEL: 'silent',
  ADAPTERS_MODE: 'fake',
};

test('acepta el modo fake sin DATABASE_URL', () => {
  const entorno = loadEnv({ ...ENTORNO_BASE });

  assert.equal(entorno.ADAPTERS_MODE, 'fake');
  assert.equal(entorno.PORT, 3100);
  assert.equal(entorno.DATABASE_SSL, false);
});

test('exige DATABASE_URL en modo real', () => {
  assert.throws(() => loadEnv({ ...ENTORNO_BASE, ADAPTERS_MODE: 'real' }), /DATABASE_URL/);
});

test('rechaza un puerto fuera de rango', () => {
  assert.throws(() => loadEnv({ ...ENTORNO_BASE, PORT: '70000' }), /PORT/);
});

test('convierte CORS_ORIGIN en una lista de orígenes', () => {
  const entorno = loadEnv({
    ...ENTORNO_BASE,
    CORS_ORIGIN: 'https://a.test, https://b.test',
  });

  assert.deepEqual(entorno.CORS_ORIGIN, ['https://a.test', 'https://b.test']);
});
