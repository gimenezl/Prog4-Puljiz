import assert from 'node:assert/strict';
import test from 'node:test';

import { composeApplication } from '../../src/composition-root.js';
import { loadEnv } from '../../src/infrastructure/config/env.js';
import { detenerServidor, iniciarServidor } from '../helpers/http-server.js';
import { datosDeVehiculoDePrueba } from '../helpers/vehiculos-kit.js';

const OBELISCO = { lat: -34.6037, lng: -58.3816 };

async function crearAplicacion(t) {
  const entorno = loadEnv({
    NODE_ENV: 'test',
    HOST: '127.0.0.1',
    PORT: '3000',
    LOG_LEVEL: 'silent',
    ADAPTERS_MODE: 'fake',
  });
  const composicion = composeApplication(entorno);
  const { servidor, urlBase } = await iniciarServidor(composicion.app);

  t.after(async () => {
    await detenerServidor(servidor);
    await composicion.shutdown();
  });

  return { ...composicion, urlBase };
}

async function llamar(url, { method = 'GET', token, body } = {}) {
  const cabeceras = {};

  if (body !== undefined) cabeceras['content-type'] = 'application/json';
  if (token) cabeceras.authorization = `Bearer ${token}`;

  const respuesta = await fetch(url, {
    method,
    headers: cabeceras,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const texto = await respuesta.text();

  return { status: respuesta.status, cuerpo: texto.length > 0 ? JSON.parse(texto) : null };
}

async function crearCuenta(urlBase, { email, rol }) {
  await llamar(`${urlBase}/auth/registro`, {
    method: 'POST',
    body: { email, nombre: 'Cuenta de prueba', contrasena: 'Segura123', rol },
  });
  const sesion = await llamar(`${urlBase}/auth/login`, {
    method: 'POST',
    body: { email, contrasena: 'Segura123' },
  });
  assert.equal(sesion.status, 200);
  return sesion.cuerpo;
}

async function habilitar(composicion, urlBase, chofer) {
  await llamar(`${urlBase}/choferes/yo/vehiculo`, {
    method: 'PUT',
    token: chofer.token,
    body: datosDeVehiculoDePrueba(),
  });
  const { token } = await composicion.servicioDeTokens.firmar({
    usuarioId: '11111111-1111-4111-8111-111111111111',
    rol: 'ADMINISTRADOR',
  });
  const respuesta = await llamar(`${urlBase}/choferes/${chofer.usuario.id}/habilitacion`, {
    method: 'PATCH',
    token,
    body: { habilitado: true },
  });
  assert.equal(respuesta.status, 200);
}

test('un chofer habilitado informa su ubicación con la hora del servidor', async (t) => {
  const composicion = await crearAplicacion(t);
  const chofer = await crearCuenta(composicion.urlBase, {
    email: 'chofer@example.com',
    rol: 'CHOFER',
  });
  await habilitar(composicion, composicion.urlBase, chofer);

  const respuesta = await llamar(`${composicion.urlBase}/choferes/yo/ubicacion`, {
    method: 'PUT',
    token: chofer.token,
    body: OBELISCO,
  });

  assert.equal(respuesta.status, 200);
  assert.deepEqual(respuesta.cuerpo.ubicacion, {
    choferId: chofer.usuario.id,
    punto: OBELISCO,
    actualizadaEn: composicion.reloj.ahora().toISOString(),
  });

  const guardada = await composicion.repositorioUbicaciones.buscarPorChoferId(chofer.usuario.id);
  assert.deepEqual(guardada.punto.aJSON(), OBELISCO);
});

test('rechaza a un chofer inhabilitado, a otros roles y datos inválidos', async (t) => {
  const { urlBase } = await crearAplicacion(t);
  const chofer = await crearCuenta(urlBase, { email: 'chofer@example.com', rol: 'CHOFER' });
  const pasajero = await crearCuenta(urlBase, { email: 'pasajero@example.com', rol: 'PASAJERO' });
  const url = `${urlBase}/choferes/yo/ubicacion`;

  const inhabilitado = await llamar(url, { method: 'PUT', token: chofer.token, body: OBELISCO });
  assert.equal(inhabilitado.status, 409);
  assert.equal(inhabilitado.cuerpo.error.codigo, 'CHOFER_NO_ELEGIBLE');

  const comoPasajero = await llamar(url, { method: 'PUT', token: pasajero.token, body: OBELISCO });
  assert.equal(comoPasajero.status, 403);

  for (const body of [
    { lat: 91, lng: 0 },
    { lat: -34.6, lng: '-58.4' },
    { lat: -34.6 },
    { ...OBELISCO, actualizadaEn: '2030-01-01T00:00:00.000Z' },
  ]) {
    const respuesta = await llamar(url, { method: 'PUT', token: chofer.token, body });
    assert.equal(respuesta.status, 400, JSON.stringify(body));
    assert.equal(respuesta.cuerpo.error.codigo, 'DATOS_INVALIDOS');
  }
});
