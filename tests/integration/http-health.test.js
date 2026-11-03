import assert from 'node:assert/strict';
import test from 'node:test';

import pino from 'pino';

import { createHttpApp } from '../../src/infrastructure/adapters/in/http/app.js';
import { detenerServidor, iniciarServidor } from '../helpers/http-server.js';

const logger = pino({ level: 'silent' });

test('GET /health es liveness y no consulta dependencias externas', async (t) => {
  let chequeos = 0;
  const app = createHttpApp({
    logger,
    readinessCheck: async () => {
      chequeos += 1;
      return { baseDeDatos: { ok: false } };
    },
  });
  const { servidor, urlBase } = await iniciarServidor(app);
  t.after(() => detenerServidor(servidor));

  const respuesta = await fetch(`${urlBase}/health`, {
    headers: { 'x-request-id': 'liveness-123' },
  });

  assert.equal(respuesta.status, 200);
  assert.equal(respuesta.headers.get('x-request-id'), 'liveness-123');
  const cuerpo = await respuesta.json();
  assert.equal(cuerpo.estado, 'ok');
  assert.equal(cuerpo.tipo, 'liveness');
  assert.equal(chequeos, 0);
});

test('GET /ready responde 200 cuando todas las dependencias están disponibles', async (t) => {
  const app = createHttpApp({
    logger,
    readinessCheck: async () => ({ baseDeDatos: { ok: true }, reloj: { ok: true } }),
  });
  const { servidor, urlBase } = await iniciarServidor(app);
  t.after(() => detenerServidor(servidor));

  const respuesta = await fetch(`${urlBase}/ready`);

  assert.equal(respuesta.status, 200);
  const cuerpo = await respuesta.json();
  assert.equal(cuerpo.estado, 'listo');
  assert.equal(cuerpo.chequeos.baseDeDatos.ok, true);
});

test('GET /ready responde 503 cuando una dependencia falla', async (t) => {
  const app = createHttpApp({
    logger,
    readinessCheck: async () => ({ baseDeDatos: { ok: false }, reloj: { ok: true } }),
  });
  const { servidor, urlBase } = await iniciarServidor(app);
  t.after(() => detenerServidor(servidor));

  const respuesta = await fetch(`${urlBase}/ready`);

  assert.equal(respuesta.status, 503);
  const cuerpo = await respuesta.json();
  assert.equal(cuerpo.estado, 'no_listo');
  assert.equal(cuerpo.chequeos.baseDeDatos.ok, false);
});

test('una ruta inexistente responde 404 sin exponer el stack trace', async (t) => {
  const app = createHttpApp({
    logger,
    readinessCheck: async () => ({ baseDeDatos: { ok: true } }),
  });
  const { servidor, urlBase } = await iniciarServidor(app);
  t.after(() => detenerServidor(servidor));

  const respuesta = await fetch(`${urlBase}/ruta-inexistente`, {
    headers: { 'x-request-id': 'no-existe-123' },
  });

  assert.equal(respuesta.status, 404);
  const cuerpo = await respuesta.json();
  assert.equal(cuerpo.error.codigo, 'RECURSO_NO_ENCONTRADO');
  assert.equal(cuerpo.requestId, 'no-existe-123');
  assert.equal(JSON.stringify(cuerpo).includes('stack'), false);
});
