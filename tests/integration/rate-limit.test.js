import assert from 'node:assert/strict';
import test from 'node:test';

import { composeApplication } from '../../src/composition-root.js';
import { loadEnv } from '../../src/infrastructure/config/env.js';
import { detenerServidor, iniciarServidor } from '../helpers/http-server.js';

const ORIGEN = { lat: -34.6037, lng: -58.3816 };
const DESTINO = { lat: -34.6083, lng: -58.3712 };

function cargarEntorno(sobrescrituras = {}) {
  return loadEnv({
    NODE_ENV: 'test',
    HOST: '127.0.0.1',
    PORT: '3000',
    LOG_LEVEL: 'silent',
    ADAPTERS_MODE: 'fake',
    RATE_LIMIT_MAX: '1000',
    ...sobrescrituras,
  });
}

async function crearAplicacion(t, sobrescrituras) {
  const composicion = composeApplication(cargarEntorno(sobrescrituras));
  const { servidor, urlBase } = await iniciarServidor(composicion.app);

  t.after(async () => {
    await detenerServidor(servidor);
    await composicion.shutdown();
  });

  return { ...composicion, urlBase };
}

async function llamar(url, { method = 'GET', token, body, headers = {} } = {}) {
  const cabeceras = { ...headers };

  if (body !== undefined) cabeceras['content-type'] = 'application/json';
  if (token) cabeceras.authorization = `Bearer ${token}`;

  const respuesta = await fetch(url, {
    method,
    headers: cabeceras,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const texto = await respuesta.text();

  return {
    respuesta,
    cuerpo: texto.length > 0 ? JSON.parse(texto) : null,
  };
}

async function registrarPasajero(urlBase, email = 'pasajero@example.com') {
  const registro = await llamar(`${urlBase}/auth/registro`, {
    method: 'POST',
    body: { email, nombre: 'Pasajero', contrasena: 'Segura123', rol: 'PASAJERO' },
  });
  assert.equal(registro.respuesta.status, 201);

  const sesion = await llamar(`${urlBase}/auth/login`, {
    method: 'POST',
    body: { email, contrasena: 'Segura123' },
  });
  assert.equal(sesion.respuesta.status, 200);
  return sesion.cuerpo.token;
}

function afirmarEncabezadosInformativos(respuesta) {
  assert.equal(respuesta.headers.get('ratelimit-limit'), '1');
  assert.equal(respuesta.headers.get('ratelimit-remaining'), '0');
  assert.equal(Number(respuesta.headers.get('ratelimit-reset')) > 0, true);
}

test('el registro tiene límite propio y publica RateLimit-* y Retry-After', async (t) => {
  const { urlBase } = await crearAplicacion(t, {
    REGISTRO_RATE_LIMIT_MAX: '1',
    REGISTRO_RATE_LIMIT_WINDOW_MS: '60000',
  });

  const primero = await llamar(`${urlBase}/auth/registro`, {
    method: 'POST',
    body: {
      email: 'limite@example.com',
      nombre: 'Límite',
      contrasena: 'Segura123',
      rol: 'PASAJERO',
    },
  });

  assert.equal(primero.respuesta.status, 201);
  afirmarEncabezadosInformativos(primero.respuesta);

  const segundo = await llamar(`${urlBase}/auth/registro`, {
    method: 'POST',
    body: {
      email: 'limite2@example.com',
      nombre: 'Límite Dos',
      contrasena: 'Segura123',
      rol: 'PASAJERO',
    },
  });

  assert.equal(segundo.respuesta.status, 429);
  assert.equal(segundo.cuerpo.error.codigo, 'DEMASIADAS_SOLICITUDES');
  assert.match(segundo.cuerpo.error.mensaje, /registros/);
  assert.equal(typeof segundo.cuerpo.requestId, 'string');
  afirmarEncabezadosInformativos(segundo.respuesta);
  assert.equal(Number(segundo.respuesta.headers.get('retry-after')) > 0, true);
});

test('las operaciones costosas de viajes tienen límite propio y encabezados', async (t) => {
  const { urlBase } = await crearAplicacion(t, {
    VIAJES_RATE_LIMIT_MAX: '1',
    VIAJES_RATE_LIMIT_WINDOW_MS: '60000',
  });
  const token = await registrarPasajero(urlBase);

  const primero = await llamar(`${urlBase}/viajes`, {
    method: 'POST',
    token,
    headers: { 'Idempotency-Key': 'rate-limit-1' },
    body: { origen: ORIGEN, destino: DESTINO },
  });

  assert.equal(primero.respuesta.status, 201);
  afirmarEncabezadosInformativos(primero.respuesta);

  const segundo = await llamar(`${urlBase}/viajes`, {
    method: 'POST',
    token,
    headers: { 'Idempotency-Key': 'rate-limit-2' },
    body: { origen: ORIGEN, destino: DESTINO },
  });

  assert.equal(segundo.respuesta.status, 429);
  assert.equal(segundo.cuerpo.error.codigo, 'DEMASIADAS_SOLICITUDES');
  assert.equal(typeof segundo.cuerpo.requestId, 'string');
  afirmarEncabezadosInformativos(segundo.respuesta);
  assert.equal(Number(segundo.respuesta.headers.get('retry-after')) > 0, true);
});

test('el login fallido conserva su límite independiente y sus encabezados', async (t) => {
  const { urlBase } = await crearAplicacion(t, { LOGIN_RATE_LIMIT_MAX: '1' });
  await registrarPasajero(urlBase, 'login@example.com');

  const primero = await llamar(`${urlBase}/auth/login`, {
    method: 'POST',
    body: { email: 'login@example.com', contrasena: 'Incorrecta123' },
  });
  assert.equal(primero.respuesta.status, 401);

  const segundo = await llamar(`${urlBase}/auth/login`, {
    method: 'POST',
    body: { email: 'login@example.com', contrasena: 'Incorrecta123' },
  });

  assert.equal(segundo.respuesta.status, 429);
  assert.equal(segundo.cuerpo.error.codigo, 'DEMASIADAS_SOLICITUDES');
  assert.equal(typeof segundo.cuerpo.requestId, 'string');
  afirmarEncabezadosInformativos(segundo.respuesta);
  assert.equal(Number(segundo.respuesta.headers.get('retry-after')) > 0, true);
});
