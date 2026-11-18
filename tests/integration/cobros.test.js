import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { composeApplication } from '../../src/composition-root.js';
import { ROLES, Usuario } from '../../src/domain/entities/usuario.js';
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

async function crearCuenta(urlBase, { email, nombre, rol }) {
  const registro = await llamar(`${urlBase}/auth/registro`, {
    method: 'POST',
    body: { email, nombre, contrasena: 'Segura123', rol },
  });
  assert.equal(registro.respuesta.status, 201);

  const sesion = await llamar(`${urlBase}/auth/login`, {
    method: 'POST',
    body: { email, contrasena: 'Segura123' },
  });
  assert.equal(sesion.respuesta.status, 200);

  return sesion.cuerpo;
}

async function crearCuentaDirecta(composicion, { rol, email }) {
  const usuario = new Usuario({
    id: randomUUID(),
    email,
    nombre: `Usuario ${rol}`,
    credencial: await composicion.hasherContrasenas.hashear('Segura123'),
    rol,
    creadoEn: new Date(),
  });

  await composicion.repositorioUsuarios.crear(usuario);
  const { token } = await composicion.servicioDeTokens.firmar({
    usuarioId: usuario.id,
    rol: usuario.rol,
  });

  return { usuario, token };
}

async function prepararChofer(composicion, urlBase, admin, datos) {
  const sesion = await crearCuenta(urlBase, { ...datos, rol: ROLES.CHOFER });

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

function crearViaje(urlBase, token, clave) {
  return llamar(`${urlBase}/viajes`, {
    method: 'POST',
    token,
    headers: { 'Idempotency-Key': clave },
    body: { origen: ORIGEN, destino: DESTINO },
  });
}

function finalizarViaje(urlBase, token, viajeId, clave) {
  const headers = clave === undefined ? {} : { 'Idempotency-Key': clave };

  return llamar(`${urlBase}/viajes/${viajeId}/finalizar`, {
    method: 'POST',
    token,
    headers,
  });
}

test('finalizar cobra una sola vez y el cobro se consulta según el rol', async (t) => {
  const composicion = await crearAplicacion(t);
  const { urlBase } = composicion;
  const admin = await crearCuentaDirecta(composicion, {
    rol: ROLES.ADMINISTRADOR,
    email: 'admin@cobros.test',
  });
  const soporte = await crearCuentaDirecta(composicion, {
    rol: ROLES.OPERADOR_SOPORTE,
    email: 'soporte@cobros.test',
  });
  const pasajero = await crearCuenta(urlBase, {
    email: 'pasajero@cobros.test',
    nombre: 'Pasajero',
    rol: ROLES.PASAJERO,
  });
  const otroPasajero = await crearCuenta(urlBase, {
    email: 'otro@cobros.test',
    nombre: 'Otro Pasajero',
    rol: ROLES.PASAJERO,
  });
  const chofer = await prepararChofer(composicion, urlBase, admin, {
    email: 'chofer@cobros.test',
    nombre: 'Chofer',
  });
  const otroChofer = await prepararChofer(composicion, urlBase, admin, {
    email: 'chofer2@cobros.test',
    nombre: 'Otro Chofer',
  });

  const creacion = await crearViaje(urlBase, pasajero.token, 'viaje-a-cobrar');
  assert.equal(creacion.respuesta.status, 201);
  const viajeId = creacion.cuerpo.viaje.id;

  const aceptacion = await llamar(`${urlBase}/viajes/${viajeId}/aceptar`, {
    method: 'POST',
    token: chofer.token,
  });
  assert.equal(aceptacion.respuesta.status, 200);

  const porRolIncorrecto = await finalizarViaje(urlBase, pasajero.token, viajeId, 'clave-1');
  assert.equal(porRolIncorrecto.respuesta.status, 403);

  const porOtroChofer = await finalizarViaje(
    urlBase,
    otroChofer.token,
    viajeId,
    'clave-otro-chofer',
  );
  assert.equal(porOtroChofer.respuesta.status, 403);
  assert.equal(porOtroChofer.cuerpo.error.codigo, 'NO_AUTORIZADO');

  const sinClave = await finalizarViaje(urlBase, chofer.token, viajeId);
  assert.equal(sinClave.respuesta.status, 400);
  assert.equal(sinClave.cuerpo.error.codigo, 'CLAVE_DE_IDEMPOTENCIA_REQUERIDA');

  const finalizacion = await finalizarViaje(urlBase, chofer.token, viajeId, 'clave-final');
  assert.equal(finalizacion.respuesta.status, 200);
  assert.equal(finalizacion.respuesta.headers.get('idempotency-replayed'), null);
  assert.equal(finalizacion.cuerpo.viaje.estado, 'FINALIZADO');
  assert.equal(finalizacion.cuerpo.cobro.estado, 'COBRADO');
  assert.equal(finalizacion.cuerpo.cobro.montoCentavos, creacion.cuerpo.viaje.precioFijadoCentavos);
  assert.equal(finalizacion.cuerpo.cobro.referencia, `SIM-${viajeId}`);
  assert.equal(composicion.simuladorDeCobro.cantidadLlamadas, 1);

  const reintento = await finalizarViaje(urlBase, chofer.token, viajeId, 'clave-final');
  assert.equal(reintento.respuesta.status, 200);
  assert.equal(reintento.respuesta.headers.get('idempotency-replayed'), 'true');
  assert.equal(reintento.cuerpo.viaje.id, finalizacion.cuerpo.viaje.id);
  assert.equal(reintento.cuerpo.cobro.id, finalizacion.cuerpo.cobro.id);
  assert.equal(composicion.simuladorDeCobro.cantidadLlamadas, 1);

  const cobroPasajero = await llamar(`${urlBase}/viajes/${viajeId}/cobro`, {
    token: pasajero.token,
  });
  assert.equal(cobroPasajero.respuesta.status, 200);
  assert.equal(cobroPasajero.cuerpo.cobro.referencia, `SIM-${viajeId}`);

  const cobroChofer = await llamar(`${urlBase}/viajes/${viajeId}/cobro`, {
    token: chofer.token,
  });
  assert.equal(cobroChofer.respuesta.status, 200);

  const cobroAjeno = await llamar(`${urlBase}/viajes/${viajeId}/cobro`, {
    token: otroPasajero.token,
  });
  assert.equal(cobroAjeno.respuesta.status, 403);
  assert.equal(cobroAjeno.cuerpo.error.codigo, 'NO_AUTORIZADO');

  const cobroAdmin = await llamar(`${urlBase}/viajes/${viajeId}/cobro`, {
    token: admin.token,
  });
  assert.equal(cobroAdmin.respuesta.status, 200);

  const cobroSoporte = await llamar(`${urlBase}/viajes/${viajeId}/cobro`, {
    token: soporte.token,
  });
  assert.equal(cobroSoporte.respuesta.status, 200);

  const perfil = await llamar(`${urlBase}/choferes/yo`, { token: chofer.token });
  assert.equal(perfil.cuerpo.chofer.viajeActivoId, null);
  assert.equal(perfil.cuerpo.chofer.estado, 'DISPONIBLE');
});

test('reutilizar la clave con otro viaje da 409 y no registra un cobro', async (t) => {
  const composicion = await crearAplicacion(t);
  const { urlBase } = composicion;
  const admin = await crearCuentaDirecta(composicion, {
    rol: ROLES.ADMINISTRADOR,
    email: 'admin@conflicto.test',
  });
  const pasajero = await crearCuenta(urlBase, {
    email: 'pasajero@conflicto.test',
    nombre: 'Pasajero',
    rol: ROLES.PASAJERO,
  });
  const chofer = await prepararChofer(composicion, urlBase, admin, {
    email: 'chofer@conflicto.test',
    nombre: 'Chofer',
  });

  const primero = await crearViaje(urlBase, pasajero.token, 'viaje-uno');
  await llamar(`${urlBase}/viajes/${primero.cuerpo.viaje.id}/aceptar`, {
    method: 'POST',
    token: chofer.token,
  });

  const finalizado = await finalizarViaje(
    urlBase,
    chofer.token,
    primero.cuerpo.viaje.id,
    'clave-compartida',
  );
  assert.equal(finalizado.respuesta.status, 200);

  const segundo = await crearViaje(urlBase, pasajero.token, 'viaje-dos');
  const segundoId = segundo.cuerpo.viaje.id;

  const sinCobro = await llamar(`${urlBase}/viajes/${segundoId}/cobro`, {
    token: pasajero.token,
  });
  assert.equal(sinCobro.respuesta.status, 404);

  await llamar(`${urlBase}/viajes/${segundoId}/aceptar`, {
    method: 'POST',
    token: chofer.token,
  });

  const conflicto = await finalizarViaje(urlBase, chofer.token, segundoId, 'clave-compartida');
  assert.equal(conflicto.respuesta.status, 409);
  assert.equal(conflicto.cuerpo.error.codigo, 'CLAVE_REUTILIZADA_CON_OTRO_CONTENIDO');

  const viajeSinCambios = await llamar(`${urlBase}/viajes/${segundoId}`, {
    token: pasajero.token,
  });
  assert.equal(viajeSinCambios.cuerpo.viaje.estado, 'ASIGNADO');
  assert.equal(composicion.simuladorDeCobro.cantidadLlamadas, 1);

  const conOtraClave = await finalizarViaje(urlBase, chofer.token, segundoId, 'clave-nueva');
  assert.equal(conOtraClave.respuesta.status, 200);
  assert.equal(conOtraClave.cuerpo.cobro.referencia, `SIM-${segundoId}`);
  assert.equal(composicion.simuladorDeCobro.cantidadLlamadas, 2);
});

test('dos finalizaciones simultáneas por HTTP con la misma clave devuelven un solo cobro', async (t) => {
  const composicion = await crearAplicacion(t);
  const { urlBase } = composicion;
  const admin = await crearCuentaDirecta(composicion, {
    rol: ROLES.ADMINISTRADOR,
    email: 'admin@concurrente.test',
  });
  const pasajero = await crearCuenta(urlBase, {
    email: 'pasajero@concurrente.test',
    nombre: 'Pasajero',
    rol: ROLES.PASAJERO,
  });
  const chofer = await prepararChofer(composicion, urlBase, admin, {
    email: 'chofer@concurrente.test',
    nombre: 'Chofer',
  });

  const creacion = await crearViaje(urlBase, pasajero.token, 'viaje-concurrente');
  const viajeId = creacion.cuerpo.viaje.id;
  await llamar(`${urlBase}/viajes/${viajeId}/aceptar`, {
    method: 'POST',
    token: chofer.token,
  });

  const [a, b] = await Promise.all([
    finalizarViaje(urlBase, chofer.token, viajeId, 'misma-clave'),
    finalizarViaje(urlBase, chofer.token, viajeId, 'misma-clave'),
  ]);

  assert.deepEqual(
    [a.respuesta.status, b.respuesta.status].sort((x, y) => x - y),
    [200, 200],
  );
  assert.equal(a.cuerpo.cobro.id, b.cuerpo.cobro.id);

  const replicas = [a, b].filter(
    (respuesta) => respuesta.respuesta.headers.get('idempotency-replayed') === 'true',
  );
  assert.equal(replicas.length, 1);
  assert.equal(composicion.simuladorDeCobro.cantidadLlamadas, 1);
});
