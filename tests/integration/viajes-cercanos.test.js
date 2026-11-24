import assert from 'node:assert/strict';
import test from 'node:test';

import { composeApplication } from '../../src/composition-root.js';
import { loadEnv } from '../../src/infrastructure/config/env.js';
import { detenerServidor, iniciarServidor } from '../helpers/http-server.js';
import { BELGRANO, CONGRESO, OBELISCO } from '../helpers/lugares.js';
import { datosDeVehiculoDePrueba } from '../helpers/vehiculos-kit.js';

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';

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

// Registra un chofer listo para trabajar, ubicado en `punto`.
async function choferListoEn(composicion, email, punto) {
  const { urlBase } = composicion;
  const chofer = await crearCuenta(urlBase, { email, rol: 'CHOFER' });
  const { token: tokenAdmin } = await composicion.servicioDeTokens.firmar({
    usuarioId: ADMIN_ID,
    rol: 'ADMINISTRADOR',
  });

  const pasos = [
    ['PUT', '/choferes/yo/vehiculo', chofer.token, datosDeVehiculoDePrueba()],
    ['PATCH', `/choferes/${chofer.usuario.id}/habilitacion`, tokenAdmin, { habilitado: true }],
    ['PATCH', '/choferes/yo', chofer.token, { disponible: true }],
    ['PUT', '/choferes/yo/ubicacion', chofer.token, punto],
  ];

  for (const [method, ruta, token, body] of pasos) {
    const respuesta = await llamar(`${urlBase}${ruta}`, { method, token, body });
    assert.ok(respuesta.status < 300, `${method} ${ruta} -> ${respuesta.status}`);
  }

  return chofer;
}

test('cada chofer ve solo los viajes cercanos a su ubicación, con la distancia', async (t) => {
  const composicion = await crearAplicacion(t);
  const { urlBase } = composicion;
  const pasajero = await crearCuenta(urlBase, { email: 'pasajero@example.com', rol: 'PASAJERO' });

  const viaje = await llamar(`${urlBase}/viajes`, {
    method: 'POST',
    token: pasajero.token,
    headers: { 'idempotency-key': 'viaje-obelisco' },
    body: { origen: OBELISCO, destino: CONGRESO },
  });
  assert.equal(viaje.status, 201);

  const cerca = await choferListoEn(composicion, 'cerca@example.com', CONGRESO);
  const lejos = await choferListoEn(composicion, 'lejos@example.com', BELGRANO);

  const paraCerca = await llamar(`${urlBase}/viajes/disponibles`, { token: cerca.token });
  assert.equal(paraCerca.status, 200);
  assert.deepEqual(
    paraCerca.cuerpo.viajes.map((v) => v.id),
    [viaje.cuerpo.viaje.id],
  );
  assert.equal(Math.round(paraCerca.cuerpo.viajes[0].distanciaM / 100), 12);

  const paraLejos = await llamar(`${urlBase}/viajes/disponibles`, { token: lejos.token });
  assert.equal(paraLejos.status, 200);
  assert.deepEqual(paraLejos.cuerpo.viajes, []);
});
