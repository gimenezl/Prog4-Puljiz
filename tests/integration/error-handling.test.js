import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import test from 'node:test';

import express from 'express';
import pino from 'pino';

import { ErrorDeDominio } from '../../src/domain/errors/error-de-dominio.js';
import { createHttpApp } from '../../src/infrastructure/adapters/in/http/app.js';
import { asyncHandler } from '../../src/infrastructure/adapters/in/http/async-handler.js';
import { createErrorHandler } from '../../src/infrastructure/adapters/in/http/middlewares/error-handler.js';
import { notFoundHandler } from '../../src/infrastructure/adapters/in/http/middlewares/not-found.js';
import { createRequestContextMiddleware } from '../../src/infrastructure/adapters/in/http/middlewares/request-context.js';
import {
  obtenerLogger,
  obtenerRequestId,
} from '../../src/infrastructure/context/request-context.js';
import { detenerServidor, iniciarServidor } from '../helpers/http-server.js';

const logger = pino({ level: 'silent' });

function crearAppDePrueba() {
  const app = express();

  app.use(createRequestContextMiddleware({ logger }));

  app.get('/dominio', () => {
    throw new ErrorDeDominio('OFERTA_VENCIDA', 'La oferta ya venció.');
  });

  app.get('/inesperado', () => {
    throw new Error('detalle interno que no debe salir');
  });

  app.get('/http-400', () => {
    throw Object.assign(new Error('detalle sensible del parser'), { status: 400 });
  });

  app.get(
    '/async',
    asyncHandler(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      throw new ErrorDeDominio('DATOS_INVALIDOS', 'El origen es obligatorio.');
    }),
  );

  app.get(
    '/contexto',
    asyncHandler(async (_req, res) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      res.json({
        requestId: obtenerRequestId(),
        tieneLogger: Boolean(obtenerLogger()),
      });
    }),
  );

  app.use(notFoundHandler);
  app.use(createErrorHandler({ logger }));

  return app;
}

async function conServidor(prueba) {
  return async (t) => {
    const { servidor, urlBase } = await iniciarServidor(crearAppDePrueba());
    t.after(() => detenerServidor(servidor));
    await prueba(urlBase);
  };
}

test(
  'mapea un error de dominio al código HTTP correcto sin stack trace',
  conServidor(async (urlBase) => {
    const respuesta = await fetch(`${urlBase}/dominio`, {
      headers: { 'x-request-id': 'correlacion-123' },
    });

    assert.equal(respuesta.status, 410);
    assert.equal(respuesta.headers.get('x-request-id'), 'correlacion-123');

    const cuerpo = await respuesta.json();
    assert.deepEqual(cuerpo, {
      error: { codigo: 'OFERTA_VENCIDA', mensaje: 'La oferta ya venció.' },
      requestId: 'correlacion-123',
    });
    assert.equal(JSON.stringify(cuerpo).includes('stack'), false);
  }),
);

test(
  'oculta el detalle de un error inesperado',
  conServidor(async (urlBase) => {
    const respuesta = await fetch(`${urlBase}/inesperado`, {
      headers: { 'x-request-id': 'error-interno-1' },
    });

    assert.equal(respuesta.status, 500);
    const cuerpo = await respuesta.json();
    assert.equal(cuerpo.error.codigo, 'ERROR_INTERNO');
    assert.equal(cuerpo.error.mensaje, 'Ocurrió un error inesperado.');
    assert.equal(JSON.stringify(cuerpo).includes('detalle interno'), false);
    assert.equal(JSON.stringify(cuerpo).includes('stack'), false);
  }),
);

test(
  'captura errores de un handler asincrónico',
  conServidor(async (urlBase) => {
    const respuesta = await fetch(`${urlBase}/async`, {
      headers: { 'x-request-id': 'async-1' },
    });

    assert.equal(respuesta.status, 400);
    const cuerpo = await respuesta.json();
    assert.equal(cuerpo.error.codigo, 'DATOS_INVALIDOS');
    assert.equal(cuerpo.requestId, 'async-1');
  }),
);

test(
  'propaga el requestId por AsyncLocalStorage después de un await',
  conServidor(async (urlBase) => {
    const respuesta = await fetch(`${urlBase}/contexto`, {
      headers: { 'x-request-id': 'contexto-456' },
    });

    assert.equal(respuesta.status, 200);
    assert.equal(respuesta.headers.get('x-request-id'), 'contexto-456');

    const cuerpo = await respuesta.json();
    assert.equal(cuerpo.requestId, 'contexto-456');
    assert.equal(cuerpo.tieneLogger, true);
  }),
);

test(
  'incluye el requestId del contexto en el 404',
  conServidor(async (urlBase) => {
    const respuesta = await fetch(`${urlBase}/no-existe`, {
      headers: { 'x-request-id': 'no-encontrado-1' },
    });

    assert.equal(respuesta.status, 404);
    const cuerpo = await respuesta.json();
    assert.equal(cuerpo.requestId, 'no-encontrado-1');
  }),
);

test(
  'no expone el mensaje de un error HTTP que no es de dominio',
  conServidor(async (urlBase) => {
    const respuesta = await fetch(`${urlBase}/http-400`, {
      headers: { 'x-request-id': 'http-400-1' },
    });

    assert.equal(respuesta.status, 400);
    const cuerpo = await respuesta.json();
    assert.equal(cuerpo.error.codigo, 'SOLICITUD_INVALIDA');
    assert.equal(cuerpo.error.mensaje, 'La solicitud no pudo procesarse.');
    assert.equal(JSON.stringify(cuerpo).includes('detalle sensible'), false);
  }),
);

test('un JSON malformado responde sin filtrar el cuerpo ni datos internos', async (t) => {
  const lineas = [];
  const destino = new Writable({
    write(fragmento, _codificacion, siguiente) {
      lineas.push(fragmento.toString());
      siguiente();
    },
  });
  const loggerCapturado = pino({ level: 'warn', base: undefined }, destino);

  const app = createHttpApp({
    logger: loggerCapturado,
    readinessCheck: async () => ({ baseDeDatos: { ok: true } }),
  });
  const { servidor, urlBase } = await iniciarServidor(app);
  t.after(() => detenerServidor(servidor));

  const respuesta = await fetch(`${urlBase}/health`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-request-id': 'json-malo-1',
    },
    body: '{token: "secreto-no-debe-salir"',
  });

  assert.equal(respuesta.status, 400);
  const cuerpo = await respuesta.json();
  assert.equal(cuerpo.error.codigo, 'CUERPO_INVALIDO');
  assert.equal(cuerpo.error.mensaje, 'El cuerpo de la solicitud no es JSON válido.');
  assert.equal(cuerpo.requestId, 'json-malo-1');
  assert.equal(JSON.stringify(cuerpo).includes('secreto-no-debe-salir'), false);

  const logs = lineas.join('\n');
  assert.equal(logs.includes('secreto-no-debe-salir'), false);
  assert.equal(logs.includes('"body"'), false);
  assert.equal(logs.includes('json-malo-1'), true);
});
