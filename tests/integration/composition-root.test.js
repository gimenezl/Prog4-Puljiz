import assert from 'node:assert/strict';
import test from 'node:test';

import { composeApplication } from '../../src/composition-root.js';
import { loadEnv } from '../../src/infrastructure/config/env.js';
import { detenerServidor, iniciarServidor } from '../helpers/http-server.js';

test('el composition root puede arrancar con adaptadores falsos', async (t) => {
  const entorno = loadEnv({
    NODE_ENV: 'test',
    HOST: '127.0.0.1',
    PORT: '3000',
    LOG_LEVEL: 'silent',
    ADAPTERS_MODE: 'fake',
  });
  const { app, shutdown } = composeApplication(entorno);
  const { servidor, urlBase } = await iniciarServidor(app);

  t.after(async () => {
    await detenerServidor(servidor);
    await shutdown();
  });

  const respuesta = await fetch(`${urlBase}/health`);

  assert.equal(respuesta.status, 200);
  const cuerpo = await respuesta.json();
  assert.equal(cuerpo.estado, 'ok');
  assert.equal(cuerpo.chequeos.baseDeDatos.ok, true);
  assert.equal(cuerpo.chequeos.reloj.ok, true);
});
