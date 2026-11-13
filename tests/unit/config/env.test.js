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
  assert.equal(entorno.READINESS_TIMEOUT_MS, 3000);
  assert.equal(entorno.SHUTDOWN_TIMEOUT_MS, 10000);
  assert.equal(entorno.JWT_EXPIRES_IN_MINUTES, 60);
  assert.equal(entorno.PASSWORD_HASH_COST, 12);
  assert.equal(entorno.LOGIN_RATE_LIMIT_WINDOW_MS, 900000);
  assert.equal(entorno.LOGIN_RATE_LIMIT_MAX, 5);
  assert.equal(entorno.REGISTRO_RATE_LIMIT_WINDOW_MS, 60000);
  assert.equal(entorno.REGISTRO_RATE_LIMIT_MAX, 10);
  assert.equal(entorno.VIAJES_RATE_LIMIT_WINDOW_MS, 60000);
  assert.equal(entorno.VIAJES_RATE_LIMIT_MAX, 30);
  assert.equal(entorno.TARIFA_BASE_CENTAVOS, 100000);
  assert.equal(entorno.TARIFA_POR_KM_CENTAVOS, 50000);
  assert.equal(entorno.TARIFA_MINIMO_CENTAVOS, 150000);
  assert.equal(entorno.TARIFA_MAXIMO_CENTAVOS, 1000000);
  assert.equal(entorno.IDEMPOTENCIA_TTL_MS, 86400000);
});

test('falla al arrancar si falta DATABASE_URL en modo real', () => {
  assert.throws(() => loadEnv({}), /DATABASE_URL/);
});

test('exige DATABASE_URL en modo real', () => {
  assert.throws(() => loadEnv({ ...ENTORNO_BASE, ADAPTERS_MODE: 'real' }), /DATABASE_URL/);
});

test('exige JWT_SECRET en modo real', () => {
  assert.throws(
    () =>
      loadEnv({
        ...ENTORNO_BASE,
        ADAPTERS_MODE: 'real',
        DATABASE_URL: 'postgresql://admin:password@localhost:5432/proy_db',
      }),
    /JWT_SECRET/,
  );
});

test('rechaza un JWT_SECRET demasiado corto', () => {
  assert.throws(() => loadEnv({ ...ENTORNO_BASE, JWT_SECRET: 'secreto-corto' }), /JWT_SECRET/);
});

test('rechaza un costo de bcrypt fuera del rango seguro', () => {
  assert.throws(() => loadEnv({ ...ENTORNO_BASE, PASSWORD_HASH_COST: '20' }), /PASSWORD_HASH_COST/);
});

test('rechaza una DATABASE_URL que no sea PostgreSQL', () => {
  assert.throws(
    () =>
      loadEnv({
        ...ENTORNO_BASE,
        ADAPTERS_MODE: 'real',
        DATABASE_URL: 'mysql://admin:password@localhost:3306/proy_db',
      }),
    /DATABASE_URL/,
  );
});

test('rechaza un puerto fuera de rango', () => {
  assert.throws(() => loadEnv({ ...ENTORNO_BASE, PORT: '70000' }), /PORT/);
});

test('rechaza un timeout de cierre demasiado bajo', () => {
  assert.throws(
    () => loadEnv({ ...ENTORNO_BASE, SHUTDOWN_TIMEOUT_MS: '100' }),
    /SHUTDOWN_TIMEOUT_MS/,
  );
});

test('rechaza una tarifa mínima mayor que la máxima', () => {
  assert.throws(
    () =>
      loadEnv({
        ...ENTORNO_BASE,
        TARIFA_MINIMO_CENTAVOS: '2000000',
        TARIFA_MAXIMO_CENTAVOS: '1000000',
      }),
    /TARIFA_MINIMO_CENTAVOS/,
  );
});

test('convierte CORS_ORIGIN en una lista de orígenes', () => {
  const entorno = loadEnv({
    ...ENTORNO_BASE,
    CORS_ORIGIN: 'https://a.test, https://b.test',
  });

  assert.deepEqual(entorno.CORS_ORIGIN, ['https://a.test', 'https://b.test']);
});
