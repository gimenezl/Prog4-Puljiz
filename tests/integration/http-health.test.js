import assert from 'node:assert/strict';
import test from 'node:test';

import pino from 'pino';

import { createHttpApp } from '../../src/infrastructure/adapters/in/http/app.js';
import { detenerServidor, iniciarServidor } from '../helpers/http-server.js';

const logger = pino({ level: 'silent' });

test('GET /health responde 200 cuando todos los chequeos están bien', async (t) => {
  const app = createHttpApp({
    logger,
    healthCheck: async () => ({ baseDeDatos: { ok: true }, reloj: { ok: true } }),
  });
  const { servidor, urlBase } = await iniciarServidor(app);
  t.after(() => detenerServidor(servidor));

  const respuesta = await fetch(`${urlBase}/health`);

  assert.equal(respuesta.status, 200);
  const cuerpo = await respuesta.json();
  assert.equal(cuerpo.estado, 'ok');
  assert.equal(cuerpo.chequeos.baseDeDatos.ok, true);
});

test('GET /health responde 503 cuando un chequeo falla', async (t) => {
  const app = createHttpApp({
    logger,
    healthCheck: async () => ({ baseDeDatos: { ok: false }, reloj: { ok: true } }),
  });
  const { servidor, urlBase } = await iniciarServidor(app);
  t.after(() => detenerServidor(servidor));

  const respuesta = await fetch(`${urlBase}/health`);

  assert.equal(respuesta.status, 503);
  const cuerpo = await respuesta.json();
  assert.equal(cuerpo.estado, 'degradado');
  assert.equal(cuerpo.chequeos.baseDeDatos.ok, false);
});

test('una ruta inexistente responde 404 sin exponer el stack trace', async (t) => {
  const app = createHttpApp({
    logger,
    healthCheck: async () => ({ baseDeDatos: { ok: true } }),
  });
  const { servidor, urlBase } = await iniciarServidor(app);
  t.after(() => detenerServidor(servidor));

  const respuesta = await fetch(`${urlBase}/ruta-inexistente`);

  assert.equal(respuesta.status, 404);
  const cuerpo = await respuesta.json();
  assert.equal(cuerpo.error.codigo, 'RECURSO_NO_ENCONTRADO');
  assert.equal(JSON.stringify(cuerpo).includes('stack'), false);
});
