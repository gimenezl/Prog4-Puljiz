import assert from 'node:assert/strict';
import test from 'node:test';

import { composeApplication } from '../../src/composition-root.js';
import { loadEnv } from '../../src/infrastructure/config/env.js';
import { detenerServidor, iniciarServidor } from '../helpers/http-server.js';

const VEHICULO = { patente: 'ab 123 cd', marca: 'Toyota', modelo: 'Etios', anio: 2021 };

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

  return urlBase;
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
  const registro = await llamar(`${urlBase}/auth/registro`, {
    method: 'POST',
    body: { email, nombre: 'Cuenta de prueba', contrasena: 'Segura123', rol },
  });
  assert.equal(registro.status, 201);

  const sesion = await llamar(`${urlBase}/auth/login`, {
    method: 'POST',
    body: { email, contrasena: 'Segura123' },
  });
  assert.equal(sesion.status, 200);

  return sesion.cuerpo;
}

test('el chofer registra su vehículo, lo consulta y lo edita', async (t) => {
  const urlBase = await crearAplicacion(t);
  const chofer = await crearCuenta(urlBase, { email: 'chofer@example.com', rol: 'CHOFER' });
  const url = `${urlBase}/choferes/yo/vehiculo`;

  const sinVehiculo = await llamar(url, { token: chofer.token });
  assert.equal(sinVehiculo.status, 404);
  assert.equal(sinVehiculo.cuerpo.error.codigo, 'NO_ENCONTRADO');

  const creado = await llamar(url, { method: 'PUT', token: chofer.token, body: VEHICULO });
  assert.equal(creado.status, 201);
  assert.deepEqual(
    { ...creado.cuerpo.vehiculo, id: undefined },
    {
      id: undefined,
      choferId: chofer.usuario.id,
      patente: 'AB123CD',
      marca: 'Toyota',
      modelo: 'Etios',
      anio: 2021,
      color: null,
    },
  );

  const leido = await llamar(url, { token: chofer.token });
  assert.equal(leido.status, 200);
  assert.deepEqual(leido.cuerpo.vehiculo, creado.cuerpo.vehiculo);

  const editado = await llamar(url, {
    method: 'PUT',
    token: chofer.token,
    body: { patente: 'ABC123', marca: 'Fiat', modelo: 'Cronos', color: 'Gris' },
  });
  assert.equal(editado.status, 200);
  assert.equal(editado.cuerpo.vehiculo.id, creado.cuerpo.vehiculo.id);
  assert.equal(editado.cuerpo.vehiculo.patente, 'ABC123');
  assert.equal(editado.cuerpo.vehiculo.anio, null);
});

test('una patente no puede repetirse entre choferes', async (t) => {
  const urlBase = await crearAplicacion(t);
  const uno = await crearCuenta(urlBase, { email: 'uno@example.com', rol: 'CHOFER' });
  const otro = await crearCuenta(urlBase, { email: 'otro@example.com', rol: 'CHOFER' });
  const url = `${urlBase}/choferes/yo/vehiculo`;

  assert.equal(
    (await llamar(url, { method: 'PUT', token: uno.token, body: VEHICULO })).status,
    201,
  );

  const duplicada = await llamar(url, {
    method: 'PUT',
    token: otro.token,
    body: { ...VEHICULO, patente: 'AB-123-CD' },
  });
  assert.equal(duplicada.status, 409);
  assert.equal(duplicada.cuerpo.error.codigo, 'PATENTE_YA_REGISTRADA');
});

test('valida el cuerpo y solo permite el rol chofer', async (t) => {
  const urlBase = await crearAplicacion(t);
  const chofer = await crearCuenta(urlBase, { email: 'chofer@example.com', rol: 'CHOFER' });
  const pasajero = await crearCuenta(urlBase, { email: 'pasajero@example.com', rol: 'PASAJERO' });
  const url = `${urlBase}/choferes/yo/vehiculo`;

  for (const body of [
    { ...VEHICULO, patente: 'XYZ' },
    { ...VEHICULO, anio: 2021.5 },
    { ...VEHICULO, marca: '' },
    { ...VEHICULO, choferId: pasajero.usuario.id },
  ]) {
    const respuesta = await llamar(url, { method: 'PUT', token: chofer.token, body });
    assert.equal(respuesta.status, 400, JSON.stringify(body));
    assert.equal(respuesta.cuerpo.error.codigo, 'DATOS_INVALIDOS');
  }

  const comoPasajero = await llamar(url, { method: 'PUT', token: pasajero.token, body: VEHICULO });
  assert.equal(comoPasajero.status, 403);

  const sinToken = await llamar(url, { method: 'PUT', body: VEHICULO });
  assert.equal(sinToken.status, 401);
});
