import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as esperar } from 'node:timers/promises';

import express from 'express';
import pino from 'pino';

import { createHttpApp } from '../../src/infrastructure/adapters/in/http/app.js';
import { startHttpServer } from '../../src/infrastructure/lifecycle/http-server.js';
import { createShutdownHandler } from '../../src/infrastructure/lifecycle/shutdown.js';

const logger = pino({ level: 'silent' });

test('SIGTERM cierra HTTP y recursos una sola vez', async () => {
  const app = createHttpApp({
    logger,
    readinessCheck: async () => ({ baseDeDatos: { ok: true } }),
  });
  const servidor = await startHttpServer({
    app,
    host: '127.0.0.1',
    port: 0,
    logger,
  });

  let cierres = 0;
  const shutdown = createShutdownHandler({
    servidor,
    cerrarRecursos: async () => {
      cierres += 1;
    },
    logger,
    timeoutMs: 1000,
  });

  await Promise.all([shutdown('SIGTERM'), shutdown('SIGTERM')]);

  assert.equal(cierres, 1);
  assert.equal(servidor.listening, false);
});

test('el apagado espera a que termine un pedido lento en curso', async () => {
  const app = express();
  let marcarInicio;
  const pedidoIniciado = new Promise((resolver) => {
    marcarInicio = resolver;
  });

  app.get('/lento', async (_req, res) => {
    marcarInicio();
    await esperar(150);
    res.json({ estado: 'completado' });
  });

  const servidor = await startHttpServer({
    app,
    host: '127.0.0.1',
    port: 0,
    logger,
  });
  const url = `http://127.0.0.1:${servidor.address().port}/lento`;

  let recursosCerrados = 0;
  const shutdown = createShutdownHandler({
    servidor,
    cerrarRecursos: async () => {
      recursosCerrados += 1;
    },
    logger,
    timeoutMs: 2000,
  });

  const respuestaPendiente = fetch(url);
  await pedidoIniciado;

  const apagado = shutdown('SIGTERM');

  const resultadoCarrera = await Promise.race([
    apagado.then(() => 'cerrado'),
    esperar(50).then(() => 'esperando'),
  ]);
  assert.equal(resultadoCarrera, 'esperando', 'el cierre no debe adelantarse al pedido lento');

  const respuesta = await respuestaPendiente;
  assert.equal(respuesta.status, 200);
  assert.deepEqual(await respuesta.json(), { estado: 'completado' });

  await apagado;
  assert.equal(recursosCerrados, 1);
  assert.equal(servidor.listening, false);
});

test('startHttpServer rechaza si el puerto ya está ocupado', async (t) => {
  const app = createHttpApp({
    logger,
    readinessCheck: async () => ({ baseDeDatos: { ok: true } }),
  });
  const primero = await startHttpServer({
    app,
    host: '127.0.0.1',
    port: 0,
    logger,
  });
  t.after(async () => {
    const shutdown = createShutdownHandler({ servidor: primero, logger, timeoutMs: 1000 });
    await shutdown('SIGTERM');
  });

  await assert.rejects(
    startHttpServer({
      app,
      host: '127.0.0.1',
      port: primero.address().port,
      logger,
    }),
    (error) => error.code === 'EADDRINUSE',
  );
});
