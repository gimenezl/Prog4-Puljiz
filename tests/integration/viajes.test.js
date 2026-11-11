import assert from 'node:assert/strict';
import test from 'node:test';

import { composeApplication } from '../../src/composition-root.js';
import { ROLES, Usuario } from '../../src/domain/entities/usuario.js';
import { loadEnv } from '../../src/infrastructure/config/env.js';
import { detenerServidor, iniciarServidor } from '../helpers/http-server.js';

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const ORIGEN = { lat: -34.6037, lng: -58.3816 };
const DESTINO = { lat: -34.6083, lng: -58.3712 };

function cargarEntorno(sobrescrituras = {}) {
  return loadEnv({
    NODE_ENV: 'test',
    HOST: '127.0.0.1',
    PORT: '3000',
    LOG_LEVEL: 'silent',
    ADAPTERS_MODE: 'fake',
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

async function registrar(urlBase, datos) {
  return llamar(`${urlBase}/auth/registro`, { method: 'POST', body: datos });
}

async function iniciarSesion(urlBase, email, contrasena) {
  return llamar(`${urlBase}/auth/login`, {
    method: 'POST',
    body: { email, contrasena },
  });
}

async function crearCuenta(urlBase, { email, nombre, rol }) {
  await registrar(urlBase, { email, nombre, contrasena: 'Segura123', rol });
  const sesion = await iniciarSesion(urlBase, email, 'Segura123');

  assert.equal(sesion.respuesta.status, 200);
  return sesion.cuerpo;
}

async function crearAdministrador(composicion, urlBase) {
  await composicion.repositorioUsuarios.crear(
    new Usuario({
      id: ADMIN_ID,
      email: 'admin@example.com',
      nombre: 'Admin',
      credencial: await composicion.hasherContrasenas.hashear('Admin1234'),
      rol: ROLES.ADMINISTRADOR,
      creadoEn: new Date(),
    }),
  );

  const sesion = await iniciarSesion(urlBase, 'admin@example.com', 'Admin1234');
  assert.equal(sesion.respuesta.status, 200);
  return sesion.cuerpo;
}

async function prepararChofer(composicion, urlBase, admin, datos) {
  const sesion = await crearCuenta(urlBase, { ...datos, rol: 'CHOFER' });

  const habilitacion = await llamar(`${urlBase}/choferes/${sesion.usuario.id}/habilitacion`, {
    method: 'PATCH',
    token: admin.token,
    body: { habilitado: true },
  });
  assert.equal(habilitacion.respuesta.status, 200);

  const disponibilidad = await llamar(`${urlBase}/choferes/yo`, {
    method: 'PATCH',
    token: sesion.token,
    body: { disponible: true },
  });
  assert.equal(disponibilidad.respuesta.status, 200);

  return sesion;
}

function crearViaje(urlBase, token, { key = 'clave-http', destino = DESTINO } = {}) {
  return llamar(`${urlBase}/viajes`, {
    method: 'POST',
    token,
    headers: { 'Idempotency-Key': key },
    body: { origen: ORIGEN, destino },
  });
}

test('flujo completo: registro de chofer, idempotencia, aceptación y cancelación', async (t) => {
  const composicion = await crearAplicacion(t);
  const { urlBase } = composicion;
  const admin = await crearAdministrador(composicion, urlBase);

  const pasajero = await crearCuenta(urlBase, {
    email: 'pasajero@example.com',
    nombre: 'Pasajero',
    rol: 'PASAJERO',
  });
  const chofer = await crearCuenta(urlBase, {
    email: 'chofer@example.com',
    nombre: 'Chofer',
    rol: 'CHOFER',
  });
  const otroPasajero = await crearCuenta(urlBase, {
    email: 'otro@example.com',
    nombre: 'Otro',
    rol: 'PASAJERO',
  });

  const perfilInicial = await llamar(`${urlBase}/choferes/yo`, { token: chofer.token });
  assert.equal(perfilInicial.respuesta.status, 200);
  assert.equal(perfilInicial.cuerpo.chofer.estado, 'INHABILITADO');

  const disponibleSinHabilitar = await llamar(`${urlBase}/choferes/yo`, {
    method: 'PATCH',
    token: chofer.token,
    body: { disponible: true },
  });
  assert.equal(disponibleSinHabilitar.respuesta.status, 409);
  assert.equal(disponibleSinHabilitar.cuerpo.error.codigo, 'CHOFER_NO_ELEGIBLE');

  const habilitacionAjena = await llamar(`${urlBase}/choferes/${chofer.usuario.id}/habilitacion`, {
    method: 'PATCH',
    token: pasajero.token,
    body: { habilitado: true },
  });
  assert.equal(habilitacionAjena.respuesta.status, 403);

  const habilitacion = await llamar(`${urlBase}/choferes/${chofer.usuario.id}/habilitacion`, {
    method: 'PATCH',
    token: admin.token,
    body: { habilitado: true },
  });
  assert.equal(habilitacion.respuesta.status, 200);
  assert.equal(habilitacion.cuerpo.chofer.habilitado, true);

  const disponibilidad = await llamar(`${urlBase}/choferes/yo`, {
    method: 'PATCH',
    token: chofer.token,
    body: { disponible: true },
  });
  assert.equal(disponibilidad.respuesta.status, 200);
  assert.equal(disponibilidad.cuerpo.chofer.estado, 'DISPONIBLE');

  const viajePorChofer = await crearViaje(urlBase, chofer.token);
  assert.equal(viajePorChofer.respuesta.status, 403);

  const sinClave = await llamar(`${urlBase}/viajes`, {
    method: 'POST',
    token: pasajero.token,
    body: { origen: ORIGEN, destino: DESTINO },
  });
  assert.equal(sinClave.respuesta.status, 400);
  assert.equal(sinClave.cuerpo.error.codigo, 'CLAVE_DE_IDEMPOTENCIA_REQUERIDA');

  const conPrecio = await llamar(`${urlBase}/viajes`, {
    method: 'POST',
    token: pasajero.token,
    headers: { 'Idempotency-Key': 'clave-precio' },
    body: { origen: ORIGEN, destino: DESTINO, precioFijadoCentavos: 1 },
  });
  assert.equal(conPrecio.respuesta.status, 400);
  assert.equal(conPrecio.cuerpo.error.codigo, 'DATOS_INVALIDOS');

  const creacion = await crearViaje(urlBase, pasajero.token);
  assert.equal(creacion.respuesta.status, 201);
  assert.equal(creacion.cuerpo.viaje.estado, 'SOLICITADO');
  assert.equal(creacion.cuerpo.viaje.precioFijadoCentavos > 0, true);
  assert.equal('reutilizada' in creacion.cuerpo, false);

  const repeticion = await crearViaje(urlBase, pasajero.token);
  assert.equal(repeticion.respuesta.status, 200);
  assert.equal(repeticion.respuesta.headers.get('idempotency-replayed'), 'true');
  assert.equal(repeticion.cuerpo.viaje.id, creacion.cuerpo.viaje.id);

  const conflicto = await crearViaje(urlBase, pasajero.token, {
    destino: { lat: -34.62, lng: -58.4 },
  });
  assert.equal(conflicto.respuesta.status, 409);
  assert.equal(conflicto.cuerpo.error.codigo, 'CLAVE_REUTILIZADA_CON_OTRO_CONTENIDO');

  const disponibles = await llamar(`${urlBase}/viajes/disponibles`, { token: chofer.token });
  assert.equal(disponibles.respuesta.status, 200);
  assert.deepEqual(
    disponibles.cuerpo.viajes.map((viaje) => viaje.id),
    [creacion.cuerpo.viaje.id],
  );

  const ajeno = await llamar(`${urlBase}/viajes/${creacion.cuerpo.viaje.id}`, {
    token: otroPasajero.token,
  });
  assert.equal(ajeno.respuesta.status, 403);
  assert.equal(ajeno.cuerpo.error.codigo, 'NO_AUTORIZADO');

  const inexistente = await llamar(`${urlBase}/viajes/99999999-9999-4999-8999-999999999999`, {
    token: pasajero.token,
  });
  assert.equal(inexistente.respuesta.status, 404);

  const aceptacion = await llamar(`${urlBase}/viajes/${creacion.cuerpo.viaje.id}/aceptar`, {
    method: 'POST',
    token: chofer.token,
  });
  assert.equal(aceptacion.respuesta.status, 200);
  assert.equal(aceptacion.cuerpo.viaje.estado, 'ASIGNADO');
  assert.equal(aceptacion.cuerpo.viaje.choferId, chofer.usuario.id);

  const segundaAceptacion = await llamar(`${urlBase}/viajes/${creacion.cuerpo.viaje.id}/aceptar`, {
    method: 'POST',
    token: chofer.token,
  });
  assert.equal(segundaAceptacion.respuesta.status, 409);
  assert.equal(segundaAceptacion.cuerpo.error.codigo, 'VIAJE_NO_DISPONIBLE');

  const vistaChofer = await llamar(`${urlBase}/viajes/${creacion.cuerpo.viaje.id}`, {
    token: chofer.token,
  });
  assert.equal(vistaChofer.respuesta.status, 200);

  const cancelacion = await llamar(`${urlBase}/viajes/${creacion.cuerpo.viaje.id}/cancelar`, {
    method: 'POST',
    token: pasajero.token,
    body: { motivo: 'Cambio de planes' },
  });
  assert.equal(cancelacion.respuesta.status, 200);
  assert.equal(cancelacion.cuerpo.viaje.estado, 'CANCELADO_POR_PASAJERO');

  const perfilFinal = await llamar(`${urlBase}/choferes/yo`, { token: chofer.token });
  assert.equal(perfilFinal.cuerpo.chofer.viajeActivoId, null);
  assert.equal(perfilFinal.cuerpo.chofer.estado, 'DISPONIBLE');

  const disponiblesFinal = await llamar(`${urlBase}/viajes/disponibles`, {
    token: chofer.token,
  });
  assert.equal(disponiblesFinal.cuerpo.viajes.length, 0);
});

test('dos choferes que aceptan a la vez: exactamente uno gana', async (t) => {
  const composicion = await crearAplicacion(t);
  const { urlBase } = composicion;
  const admin = await crearAdministrador(composicion, urlBase);

  const pasajero = await crearCuenta(urlBase, {
    email: 'pasajero@example.com',
    nombre: 'Pasajero',
    rol: 'PASAJERO',
  });
  const uno = await prepararChofer(composicion, urlBase, admin, {
    email: 'chofer1@example.com',
    nombre: 'Chofer Uno',
  });
  const dos = await prepararChofer(composicion, urlBase, admin, {
    email: 'chofer2@example.com',
    nombre: 'Chofer Dos',
  });

  const creacion = await crearViaje(urlBase, pasajero.token, { key: 'carrera' });
  assert.equal(creacion.respuesta.status, 201);
  const viajeId = creacion.cuerpo.viaje.id;

  const [a, b] = await Promise.all([
    llamar(`${urlBase}/viajes/${viajeId}/aceptar`, { method: 'POST', token: uno.token }),
    llamar(`${urlBase}/viajes/${viajeId}/aceptar`, { method: 'POST', token: dos.token }),
  ]);

  const estados = [a.respuesta.status, b.respuesta.status].sort((x, y) => x - y);
  assert.deepEqual(estados, [200, 409]);

  const rechazado = a.respuesta.status === 409 ? a : b;
  assert.equal(rechazado.cuerpo.error.codigo, 'VIAJE_NO_DISPONIBLE');

  const viaje = await llamar(`${urlBase}/viajes/${viajeId}`, { token: pasajero.token });
  assert.equal(viaje.cuerpo.viaje.estado, 'ASIGNADO');
  assert.equal([uno.usuario.id, dos.usuario.id].includes(viaje.cuerpo.viaje.choferId), true);
});

test('dos creaciones simultáneas con la misma clave devuelven el mismo viaje', async (t) => {
  const composicion = await crearAplicacion(t);
  const { urlBase } = composicion;
  const pasajero = await crearCuenta(urlBase, {
    email: 'pasajero@example.com',
    nombre: 'Pasajero',
    rol: 'PASAJERO',
  });

  const [a, b] = await Promise.all([
    crearViaje(urlBase, pasajero.token, { key: 'concurrente-http' }),
    crearViaje(urlBase, pasajero.token, { key: 'concurrente-http' }),
  ]);

  assert.deepEqual(
    [a.respuesta.status, b.respuesta.status].sort((x, y) => x - y),
    [200, 201],
  );
  assert.equal(a.cuerpo.viaje.id, b.cuerpo.viaje.id);
});
