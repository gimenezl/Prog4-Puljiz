import assert from 'node:assert/strict';
import test from 'node:test';

import { composeApplication } from '../../src/composition-root.js';
import { ROLES, Usuario } from '../../src/domain/entities/usuario.js';
import { loadEnv } from '../../src/infrastructure/config/env.js';
import { detenerServidor, iniciarServidor } from '../helpers/http-server.js';
import { datosDeVehiculoDePrueba } from '../helpers/vehiculos-kit.js';

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

  const vehiculo = await llamar(`${urlBase}/choferes/yo/vehiculo`, {
    method: 'PUT',
    token: sesion.token,
    body: datosDeVehiculoDePrueba(),
  });
  assert.equal(vehiculo.respuesta.status, 201);

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

  const ubicacion = await llamar(`${urlBase}/choferes/yo/ubicacion`, {
    method: 'PUT',
    token: sesion.token,
    body: { lat: -34.6037, lng: -58.3816 },
  });
  assert.equal(ubicacion.respuesta.status, 200);

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

async function aceptarViaje(urlBase, viajeId, chofer) {
  const respuesta = await llamar(`${urlBase}/viajes/${viajeId}/aceptar`, {
    method: 'POST',
    token: chofer.token,
  });
  assert.equal(respuesta.respuesta.status, 200, 'aceptar viaje al preparar el escenario');
  return respuesta;
}

async function marcarEnCamino(urlBase, viajeId, chofer) {
  const respuesta = await llamar(`${urlBase}/viajes/${viajeId}/en-camino`, {
    method: 'POST',
    token: chofer.token,
  });
  assert.equal(respuesta.respuesta.status, 200, 'marcar en camino al preparar el escenario');
  return respuesta;
}

async function iniciar(urlBase, viajeId, chofer) {
  const respuesta = await llamar(`${urlBase}/viajes/${viajeId}/iniciar`, {
    method: 'POST',
    token: chofer.token,
  });
  assert.equal(respuesta.respuesta.status, 200, 'iniciar al preparar el escenario');
  return respuesta;
}

async function cancelar(urlBase, viajeId, token, motivo = 'Motivo de prueba') {
  return llamar(`${urlBase}/viajes/${viajeId}/cancelar`, {
    method: 'POST',
    token,
    body: { motivo },
  });
}

async function crearViajeEnEstadoHTTP(urlBase, pasajero, chofer, clave, estado) {
  const creado = await crearViaje(urlBase, pasajero.token, { key: clave });
  assert.equal(creado.respuesta.status, 201, `crear viaje para ${estado}`);
  const viajeId = creado.cuerpo.viaje.id;

  await aceptarViaje(urlBase, viajeId, chofer);

  if (estado === 'ASIGNADO') return viajeId;

  if (estado === 'CANCELADO_POR_PASAJERO' || estado === 'CANCELADO_POR_CHOFER') {
    const token = estado === 'CANCELADO_POR_PASAJERO' ? pasajero.token : chofer.token;
    const cancelado = await cancelar(urlBase, viajeId, token);
    assert.equal(cancelado.cuerpo.viaje.estado, estado);
    return viajeId;
  }

  await marcarEnCamino(urlBase, viajeId, chofer);
  if (estado === 'CHOFER_EN_CAMINO') return viajeId;

  await iniciar(urlBase, viajeId, chofer);
  if (estado === 'EN_CURSO') return viajeId;

  const finalizado = await llamar(`${urlBase}/viajes/${viajeId}/finalizar`, {
    method: 'POST',
    token: chofer.token,
    headers: { 'Idempotency-Key': `${clave}-final` },
  });
  assert.equal(finalizado.respuesta.status, 200, `finalizar viaje para ${estado}`);
  return viajeId;
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

  const habilitacionSinVehiculo = await llamar(
    `${urlBase}/choferes/${chofer.usuario.id}/habilitacion`,
    { method: 'PATCH', token: admin.token, body: { habilitado: true } },
  );
  assert.equal(habilitacionSinVehiculo.respuesta.status, 409);
  assert.equal(habilitacionSinVehiculo.cuerpo.error.codigo, 'CHOFER_SIN_VEHICULO');

  const vehiculo = await llamar(`${urlBase}/choferes/yo/vehiculo`, {
    method: 'PUT',
    token: chofer.token,
    body: datosDeVehiculoDePrueba(),
  });
  assert.equal(vehiculo.respuesta.status, 201);

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

  // Sin ubicación reciente el chofer todavía no es elegible.
  const sinUbicacion = await llamar(`${urlBase}/viajes/disponibles`, { token: chofer.token });
  assert.equal(sinUbicacion.respuesta.status, 409);
  assert.equal(sinUbicacion.cuerpo.error.codigo, 'CHOFER_NO_ELEGIBLE');

  const ubicacion = await llamar(`${urlBase}/choferes/yo/ubicacion`, {
    method: 'PUT',
    token: chofer.token,
    body: { lat: -34.6037, lng: -58.3816 },
  });
  assert.equal(ubicacion.respuesta.status, 200);

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

test('las transiciones inválidas por HTTP responden 409 TRANSICION_INVALIDA', async (t) => {
  const composicion = await crearAplicacion(t, { VIAJES_RATE_LIMIT_MAX: '200' });
  const { urlBase } = composicion;
  const admin = await crearAdministrador(composicion, urlBase);
  const pasajero = await crearCuenta(urlBase, {
    email: 'pasajero-transiciones@example.com',
    nombre: 'Pasajero',
    rol: 'PASAJERO',
  });
  const choferes = [];
  for (let indice = 1; indice <= 6; indice += 1) {
    choferes.push(
      await prepararChofer(composicion, urlBase, admin, {
        email: `chofer-transiciones-${indice}@example.com`,
        nombre: `Chofer ${indice}`,
      }),
    );
  }
  const [
    choferCanceladoPasajero,
    choferCanceladoChofer,
    choferAsignado,
    choferEnCamino,
    choferEnCurso,
    choferFinalizado,
  ] = choferes;

  const canceladoPasajero = await crearViajeEnEstadoHTTP(
    urlBase,
    pasajero,
    choferCanceladoPasajero,
    'transicion-cancelado-pasajero',
    'CANCELADO_POR_PASAJERO',
  );
  const canceladoChofer = await crearViajeEnEstadoHTTP(
    urlBase,
    pasajero,
    choferCanceladoChofer,
    'transicion-cancelado-chofer',
    'CANCELADO_POR_CHOFER',
  );
  const asignado = await crearViajeEnEstadoHTTP(
    urlBase,
    pasajero,
    choferAsignado,
    'transicion-asignado',
    'ASIGNADO',
  );
  const enCamino = await crearViajeEnEstadoHTTP(
    urlBase,
    pasajero,
    choferEnCamino,
    'transicion-en-camino',
    'CHOFER_EN_CAMINO',
  );
  const enCurso = await crearViajeEnEstadoHTTP(
    urlBase,
    pasajero,
    choferEnCurso,
    'transicion-en-curso',
    'EN_CURSO',
  );
  const finalizado = await crearViajeEnEstadoHTTP(
    urlBase,
    pasajero,
    choferFinalizado,
    'transicion-finalizado',
    'FINALIZADO',
  );

  const casos = [
    ['en-camino desde EN_CURSO', enCurso, 'en-camino', choferEnCurso.token],
    [
      'en-camino desde CANCELADO_POR_PASAJERO',
      canceladoPasajero,
      'en-camino',
      choferCanceladoPasajero.token,
    ],
    ['iniciar desde ASIGNADO', asignado, 'iniciar', choferAsignado.token],
    ['iniciar desde EN_CURSO', enCurso, 'iniciar', choferEnCurso.token],
    ['iniciar desde CANCELADO_POR_CHOFER', canceladoChofer, 'iniciar', choferCanceladoChofer.token],
    ['finalizar desde ASIGNADO', asignado, 'finalizar', choferAsignado.token],
    ['finalizar desde CHOFER_EN_CAMINO', enCamino, 'finalizar', choferEnCamino.token],
    ['finalizar desde FINALIZADO', finalizado, 'finalizar', choferFinalizado.token],
    ['cancelar por chofer desde EN_CURSO', enCurso, 'cancelar', choferEnCurso.token],
    ['cancelar por pasajero desde EN_CURSO', enCurso, 'cancelar', pasajero.token],
    ['cancelar por pasajero desde FINALIZADO', finalizado, 'cancelar', pasajero.token],
    [
      'cancelar por chofer desde CANCELADO_POR_CHOFER',
      canceladoChofer,
      'cancelar',
      choferCanceladoChofer.token,
    ],
  ];

  for (const [descripcion, viajeId, ruta, token] of casos) {
    const opciones = { method: 'POST', token };
    if (ruta === 'finalizar') {
      opciones.headers = { 'Idempotency-Key': `invalida-${viajeId.slice(0, 8)}-${ruta}` };
    } else if (ruta === 'cancelar') {
      opciones.body = { motivo: 'Intento inválido' };
    }

    const resultado = await llamar(`${urlBase}/viajes/${viajeId}/${ruta}`, opciones);
    assert.equal(
      resultado.respuesta.status,
      409,
      `${descripcion}: ${JSON.stringify(resultado.cuerpo)}`,
    );
    assert.equal(resultado.cuerpo.error.codigo, 'TRANSICION_INVALIDA', descripcion);
  }
});

test('en-camino sobre un viaje SOLICITADO por HTTP rechaza al chofer no asignado', async (t) => {
  const composicion = await crearAplicacion(t);
  const { urlBase } = composicion;
  const admin = await crearAdministrador(composicion, urlBase);
  const pasajero = await crearCuenta(urlBase, {
    email: 'pasajero-solicitado@example.com',
    nombre: 'Pasajero',
    rol: 'PASAJERO',
  });
  const chofer = await prepararChofer(composicion, urlBase, admin, {
    email: 'chofer-solicitado@example.com',
    nombre: 'Chofer',
  });

  const creado = await crearViaje(urlBase, pasajero.token, { key: 'solicitado-sin-chofer' });
  assert.equal(creado.respuesta.status, 201);

  const resultado = await llamar(`${urlBase}/viajes/${creado.cuerpo.viaje.id}/en-camino`, {
    method: 'POST',
    token: chofer.token,
  });
  assert.equal(resultado.respuesta.status, 403);
  assert.equal(resultado.cuerpo.error.codigo, 'NO_AUTORIZADO');
});

test('operar sobre un viaje inexistente por HTTP responde 404 NO_ENCONTRADO', async (t) => {
  const composicion = await crearAplicacion(t, { VIAJES_RATE_LIMIT_MAX: '200' });
  const { urlBase } = composicion;
  const admin = await crearAdministrador(composicion, urlBase);
  const pasajero = await crearCuenta(urlBase, {
    email: 'pasajero-inexistente@example.com',
    nombre: 'Pasajero',
    rol: 'PASAJERO',
  });
  const chofer = await prepararChofer(composicion, urlBase, admin, {
    email: 'chofer-inexistente@example.com',
    nombre: 'Chofer',
  });

  const viajeId = '99999999-9999-4999-8999-999999999999';
  const casos = [
    ['en-camino', chofer.token],
    ['iniciar', chofer.token],
    ['finalizar', chofer.token],
    ['cancelar', pasajero.token],
  ];

  for (const [ruta, token] of casos) {
    const opciones = { method: 'POST', token };
    if (ruta === 'finalizar') {
      opciones.headers = { 'Idempotency-Key': `inexistente-${ruta}` };
    } else if (ruta === 'cancelar') {
      opciones.body = { motivo: 'Viaje inexistente' };
    }

    const resultado = await llamar(`${urlBase}/viajes/${viajeId}/${ruta}`, opciones);
    assert.equal(resultado.respuesta.status, 404, `${ruta}: ${JSON.stringify(resultado.cuerpo)}`);
    assert.equal(resultado.cuerpo.error.codigo, 'NO_ENCONTRADO', ruta);
  }
});

test('cancelar por HTTP con motivo inválido responde 400 DATOS_INVALIDOS sin cambiar el viaje', async (t) => {
  const composicion = await crearAplicacion(t, { VIAJES_RATE_LIMIT_MAX: '200' });
  const { urlBase } = composicion;
  const pasajero = await crearCuenta(urlBase, {
    email: 'pasajero-motivo@example.com',
    nombre: 'Pasajero',
    rol: 'PASAJERO',
  });

  const creado = await crearViaje(urlBase, pasajero.token, { key: 'motivo-invalido' });
  assert.equal(creado.respuesta.status, 201);
  const viajeId = creado.cuerpo.viaje.id;
  const antes = await llamar(`${urlBase}/viajes/${viajeId}`, { token: pasajero.token });
  assert.equal(antes.respuesta.status, 200);

  for (const motivo of ['', '   \t\n', 'x'.repeat(501)]) {
    const resultado = await cancelar(urlBase, viajeId, pasajero.token, motivo);
    assert.equal(resultado.respuesta.status, 400, JSON.stringify(resultado.cuerpo));
    assert.equal(resultado.cuerpo.error.codigo, 'DATOS_INVALIDOS');
  }

  const despues = await llamar(`${urlBase}/viajes/${viajeId}`, { token: pasajero.token });
  assert.equal(despues.respuesta.status, 200);
  assert.deepEqual(despues.cuerpo.viaje, antes.cuerpo.viaje);

  const cancelado = await cancelar(urlBase, viajeId, pasajero.token, '  Motivo válido  ');
  assert.equal(cancelado.respuesta.status, 200);
  assert.equal(cancelado.cuerpo.viaje.motivoCancelacion, 'Motivo válido');
});
