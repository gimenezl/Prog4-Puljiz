import assert from 'node:assert/strict';
import test from 'node:test';

import { composeApplication } from '../../src/composition-root.js';
import { ROLES, Usuario } from '../../src/domain/entities/usuario.js';
import { loadEnv } from '../../src/infrastructure/config/env.js';
import { detenerServidor, iniciarServidor } from '../helpers/http-server.js';
import { datosDeVehiculoDePrueba } from '../helpers/vehiculos-kit.js';

const ORIGEN = { lat: -34.6037, lng: -58.3816 };
const DESTINO = { lat: -34.6083, lng: -58.3712 };
const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const SOPORTE_ID = '22222222-2222-4222-8222-222222222222';

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

async function crearAplicacion(t) {
  const composicion = composeApplication(cargarEntorno());
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

async function iniciarSesion(urlBase, email, contrasena) {
  const sesion = await llamar(`${urlBase}/auth/login`, {
    method: 'POST',
    body: { email, contrasena },
  });

  assert.equal(sesion.respuesta.status, 200, `login de ${email}`);
  return sesion.cuerpo;
}

async function crearCuenta(urlBase, { email, nombre, rol }) {
  const registro = await llamar(`${urlBase}/auth/registro`, {
    method: 'POST',
    body: { email, nombre, contrasena: 'Segura123', rol },
  });

  assert.equal(registro.respuesta.status, 201, `registro de ${email}`);
  return iniciarSesion(urlBase, email, 'Segura123');
}

async function crearCuentaEspecial(
  composicion,
  urlBase,
  { id, email, nombre, rol, contrasena = 'Segura123' },
) {
  await composicion.repositorioUsuarios.crear(
    new Usuario({
      id,
      email,
      nombre,
      credencial: await composicion.hasherContrasenas.hashear(contrasena),
      rol,
      creadoEn: new Date(),
    }),
  );

  return iniciarSesion(urlBase, email, contrasena);
}

async function habilitarChofer(urlBase, admin, chofer) {
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

  const disponibilidad = await llamar(`${urlBase}/choferes/yo`, {
    method: 'PATCH',
    token: chofer.token,
    body: { disponible: true },
  });
  assert.equal(disponibilidad.respuesta.status, 200);

  const ubicacion = await llamar(`${urlBase}/choferes/yo/ubicacion`, {
    method: 'PUT',
    token: chofer.token,
    body: { lat: -34.6037, lng: -58.3816 },
  });
  assert.equal(ubicacion.respuesta.status, 200);
}

async function crearViajeAsignado(urlBase, pasajero, chofer, clave = 'autorizacion-viaje') {
  const creacion = await llamar(`${urlBase}/viajes`, {
    method: 'POST',
    token: pasajero.token,
    headers: { 'Idempotency-Key': clave },
    body: { origen: ORIGEN, destino: DESTINO },
  });
  assert.equal(creacion.respuesta.status, 201);

  const aceptacion = await llamar(`${urlBase}/viajes/${creacion.cuerpo.viaje.id}/aceptar`, {
    method: 'POST',
    token: chofer.token,
  });
  assert.equal(aceptacion.respuesta.status, 200);

  return creacion.cuerpo.viaje;
}

async function ponerViajeEnCurso(urlBase, pasajero, chofer, clave = 'autorizacion-en-curso') {
  const viaje = await crearViajeAsignado(urlBase, pasajero, chofer, clave);
  const enCamino = await llamar(`${urlBase}/viajes/${viaje.id}/en-camino`, {
    method: 'POST',
    token: chofer.token,
  });
  afirmarEstado(enCamino, 200, 'marcar en camino al preparar el escenario');

  const iniciado = await llamar(`${urlBase}/viajes/${viaje.id}/iniciar`, {
    method: 'POST',
    token: chofer.token,
  });
  afirmarEstado(iniciado, 200, 'iniciar al preparar el escenario');

  return iniciado.cuerpo.viaje;
}

async function prepararEscenario(t) {
  const composicion = await crearAplicacion(t);
  const { urlBase } = composicion;

  const admin = await crearCuentaEspecial(composicion, urlBase, {
    id: ADMIN_ID,
    email: 'admin@example.com',
    nombre: 'Admin',
    rol: ROLES.ADMINISTRADOR,
  });
  const soporte = await crearCuentaEspecial(composicion, urlBase, {
    id: SOPORTE_ID,
    email: 'soporte@example.com',
    nombre: 'Soporte',
    rol: ROLES.OPERADOR_SOPORTE,
  });

  const pasajero = await crearCuenta(urlBase, {
    email: 'pasajero@example.com',
    nombre: 'Pasajero',
    rol: ROLES.PASAJERO,
  });
  const otroPasajero = await crearCuenta(urlBase, {
    email: 'otro-pasajero@example.com',
    nombre: 'Otro pasajero',
    rol: ROLES.PASAJERO,
  });
  const chofer = await crearCuenta(urlBase, {
    email: 'chofer@example.com',
    nombre: 'Chofer',
    rol: ROLES.CHOFER,
  });
  const otroChofer = await crearCuenta(urlBase, {
    email: 'otro-chofer@example.com',
    nombre: 'Otro chofer',
    rol: ROLES.CHOFER,
  });

  await habilitarChofer(urlBase, admin, chofer);
  await habilitarChofer(urlBase, admin, otroChofer);

  return { composicion, urlBase, admin, soporte, pasajero, otroPasajero, chofer, otroChofer };
}

function afirmarEstado(resultado, esperado, descripcion) {
  assert.equal(
    resultado.respuesta.status,
    esperado,
    `${descripcion}: ${resultado.respuesta.status} ${JSON.stringify(resultado.cuerpo)}`,
  );
}

test('autorización por recurso de un viaje con cuatro roles', async (t) => {
  const { urlBase, admin, soporte, pasajero, otroPasajero, chofer, otroChofer } =
    await prepararEscenario(t);
  const viaje = await crearViajeAsignado(urlBase, pasajero, chofer);
  const urlViaje = `${urlBase}/viajes/${viaje.id}`;

  const lecturas = [
    ['pasajero dueño', pasajero, 200],
    ['chofer asignado', chofer, 200],
    ['pasajero ajeno', otroPasajero, 403],
    ['chofer ajeno', otroChofer, 403],
    ['administrador', admin, 200],
    ['operador de soporte', soporte, 200],
  ];

  for (const [descripcion, sesion, esperado] of lecturas) {
    const resultado = await llamar(urlViaje, { token: sesion.token });
    afirmarEstado(resultado, esperado, `GET viaje como ${descripcion}`);
  }

  const aceptacionesProhibidas = [
    ['pasajero dueño', pasajero],
    ['administrador', admin],
    ['operador de soporte', soporte],
  ];

  for (const [descripcion, sesion] of aceptacionesProhibidas) {
    const resultado = await llamar(`${urlViaje}/aceptar`, {
      method: 'POST',
      token: sesion.token,
    });
    afirmarEstado(resultado, 403, `aceptar como ${descripcion}`);
    assert.equal(resultado.cuerpo.error.codigo, 'NO_AUTORIZADO');
  }

  const otroChoferAcepta = await llamar(`${urlViaje}/aceptar`, {
    method: 'POST',
    token: otroChofer.token,
  });
  afirmarEstado(otroChoferAcepta, 409, 'aceptar como chofer ajeno');
  assert.equal(otroChoferAcepta.cuerpo.error.codigo, 'VIAJE_NO_DISPONIBLE');

  // Soporte sí puede cancelar (RF-15): se prueba aparte, en
  // «soporte cancela por HTTP un viaje en curso».
  const cancelacionesProhibidas = [
    ['pasajero ajeno', otroPasajero],
    ['chofer ajeno', otroChofer],
    ['administrador', admin],
  ];

  for (const [descripcion, sesion] of cancelacionesProhibidas) {
    const resultado = await llamar(`${urlViaje}/cancelar`, {
      method: 'POST',
      token: sesion.token,
      body: { motivo: 'Intento sin permiso' },
    });
    afirmarEstado(resultado, 403, `cancelar como ${descripcion}`);
    assert.equal(resultado.cuerpo.error.codigo, 'NO_AUTORIZADO');
  }

  const cancelacionChofer = await llamar(`${urlViaje}/cancelar`, {
    method: 'POST',
    token: chofer.token,
    body: { motivo: 'No puedo llegar' },
  });
  afirmarEstado(cancelacionChofer, 200, 'cancelar como chofer asignado');
  assert.equal(cancelacionChofer.cuerpo.viaje.estado, 'CANCELADO_POR_CHOFER');
  assert.equal(cancelacionChofer.cuerpo.viaje.canceladoPorId, chofer.usuario.id);

  const segundoViaje = await crearViajeAsignado(
    urlBase,
    pasajero,
    chofer,
    'autorizacion-viaje-pasajero',
  );
  const cancelacionPropia = await llamar(`${urlBase}/viajes/${segundoViaje.id}/cancelar`, {
    method: 'POST',
    token: pasajero.token,
    body: { motivo: 'Cambio de planes' },
  });
  afirmarEstado(cancelacionPropia, 200, 'cancelar como pasajero dueño');
  assert.equal(cancelacionPropia.cuerpo.viaje.estado, 'CANCELADO_POR_PASAJERO');
});

test('autorización por recurso de una cuenta con cuatro roles', async (t) => {
  const { urlBase, admin, soporte, pasajero, otroPasajero, chofer } = await prepararEscenario(t);
  const urlCuenta = `${urlBase}/usuarios/${pasajero.usuario.id}`;

  const lecturas = [
    ['propietario', pasajero, 200],
    ['otro pasajero', otroPasajero, 403],
    ['chofer', chofer, 403],
    ['administrador', admin, 200],
    ['operador de soporte', soporte, 403],
  ];

  for (const [descripcion, sesion, esperado] of lecturas) {
    const resultado = await llamar(urlCuenta, { token: sesion.token });
    afirmarEstado(resultado, esperado, `GET cuenta como ${descripcion}`);
  }

  const edicionesProhibidas = [
    ['otro pasajero', otroPasajero],
    ['chofer', chofer],
    ['administrador', admin],
    ['operador de soporte', soporte],
  ];

  for (const [descripcion, sesion] of edicionesProhibidas) {
    const resultado = await llamar(urlCuenta, {
      method: 'PATCH',
      token: sesion.token,
      body: { nombre: 'Nombre ajeno' },
    });
    afirmarEstado(resultado, 403, `PATCH cuenta como ${descripcion}`);
    assert.equal(resultado.cuerpo.error.codigo, 'NO_AUTORIZADO');
  }

  const edicionPropia = await llamar(urlCuenta, {
    method: 'PATCH',
    token: pasajero.token,
    body: { nombre: 'Pasajero actualizado' },
  });
  afirmarEstado(edicionPropia, 200, 'PATCH cuenta como propietario');
});

test('autorización del perfil operativo del chofer con cuatro roles', async (t) => {
  const { urlBase, admin, soporte, pasajero, chofer, otroChofer } = await prepararEscenario(t);

  const accesosAlPerfil = [
    ['chofer propietario', chofer, 200],
    ['otro chofer', otroChofer, 200],
    ['pasajero', pasajero, 403],
    ['administrador', admin, 403],
    ['operador de soporte', soporte, 403],
  ];

  for (const [descripcion, sesion, esperado] of accesosAlPerfil) {
    const resultado = await llamar(`${urlBase}/choferes/yo`, { token: sesion.token });
    afirmarEstado(resultado, esperado, `GET /choferes/yo como ${descripcion}`);
  }

  const disponibilidadAjena = await llamar(`${urlBase}/choferes/yo`, {
    method: 'PATCH',
    token: pasajero.token,
    body: { disponible: true },
  });
  afirmarEstado(disponibilidadAjena, 403, 'PATCH disponibilidad como pasajero');

  const habilitacionesProhibidas = [
    ['pasajero', pasajero],
    ['chofer', chofer],
    ['otro chofer', otroChofer],
    ['operador de soporte', soporte],
  ];

  for (const [descripcion, sesion] of habilitacionesProhibidas) {
    const resultado = await llamar(`${urlBase}/choferes/${otroChofer.usuario.id}/habilitacion`, {
      method: 'PATCH',
      token: sesion.token,
      body: { habilitado: true },
    });
    afirmarEstado(resultado, 403, `habilitar chofer como ${descripcion}`);
    assert.equal(resultado.cuerpo.error.codigo, 'NO_AUTORIZADO');
  }

  const habilitacionAdmin = await llamar(
    `${urlBase}/choferes/${otroChofer.usuario.id}/habilitacion`,
    {
      method: 'PATCH',
      token: admin.token,
      body: { habilitado: true },
    },
  );
  afirmarEstado(habilitacionAdmin, 200, 'habilitar chofer como administrador');
});

test('en-camino e iniciar exigen el chofer asignado y rechazan a los demás roles', async (t) => {
  const { urlBase, admin, soporte, pasajero, chofer, otroChofer } = await prepararEscenario(t);
  const viaje = await crearViajeAsignado(urlBase, pasajero, chofer, 'matriz-en-camino');
  const urlBaseViaje = `${urlBase}/viajes/${viaje.id}`;

  const actoresProhibidos = [
    ['pasajero dueño', pasajero],
    ['administrador', admin],
    ['operador de soporte', soporte],
    ['chofer ajeno', otroChofer],
  ];

  for (const [descripcion, sesion] of actoresProhibidos) {
    const resultado = await llamar(`${urlBaseViaje}/en-camino`, {
      method: 'POST',
      token: sesion.token,
    });
    afirmarEstado(resultado, 403, `en-camino como ${descripcion}`);
    assert.equal(resultado.cuerpo.error.codigo, 'NO_AUTORIZADO');
  }

  const enCamino = await llamar(`${urlBaseViaje}/en-camino`, {
    method: 'POST',
    token: chofer.token,
  });
  afirmarEstado(enCamino, 200, 'en-camino como chofer asignado');
  assert.equal(enCamino.cuerpo.viaje.estado, 'CHOFER_EN_CAMINO');

  for (const [descripcion, sesion] of actoresProhibidos) {
    const resultado = await llamar(`${urlBaseViaje}/iniciar`, {
      method: 'POST',
      token: sesion.token,
    });
    afirmarEstado(resultado, 403, `iniciar como ${descripcion}`);
    assert.equal(resultado.cuerpo.error.codigo, 'NO_AUTORIZADO');
  }

  const iniciado = await llamar(`${urlBaseViaje}/iniciar`, {
    method: 'POST',
    token: chofer.token,
  });
  afirmarEstado(iniciado, 200, 'iniciar como chofer asignado');
  assert.equal(iniciado.cuerpo.viaje.estado, 'EN_CURSO');
});

test('finalizar por HTTP rechaza a administrador y operador de soporte', async (t) => {
  const { urlBase, admin, soporte, pasajero, chofer } = await prepararEscenario(t);
  const viaje = await ponerViajeEnCurso(urlBase, pasajero, chofer, 'matriz-finalizar');

  for (const [descripcion, sesion] of [
    ['administrador', admin],
    ['operador de soporte', soporte],
  ]) {
    const resultado = await llamar(`${urlBase}/viajes/${viaje.id}/finalizar`, {
      method: 'POST',
      token: sesion.token,
      headers: {
        'Idempotency-Key':
          descripcion === 'administrador' ? 'finalizar-admin' : 'finalizar-soporte',
      },
    });
    afirmarEstado(resultado, 403, `finalizar como ${descripcion}`);
    assert.equal(resultado.cuerpo.error.codigo, 'NO_AUTORIZADO');
  }

  const finalizado = await llamar(`${urlBase}/viajes/${viaje.id}/finalizar`, {
    method: 'POST',
    token: chofer.token,
    headers: { 'Idempotency-Key': 'finalizar-chofer-autorizado' },
  });
  afirmarEstado(finalizado, 200, 'finalizar como chofer asignado');
  assert.equal(finalizado.cuerpo.viaje.estado, 'FINALIZADO');
});

test('el chofer asignado cancela desde CHOFER_EN_CAMINO por HTTP y queda libre', async (t) => {
  const { urlBase, pasajero, chofer } = await prepararEscenario(t);
  const viaje = await crearViajeAsignado(urlBase, pasajero, chofer, 'cancelar-en-camino');
  const urlBaseViaje = `${urlBase}/viajes/${viaje.id}`;

  const enCamino = await llamar(`${urlBaseViaje}/en-camino`, {
    method: 'POST',
    token: chofer.token,
  });
  afirmarEstado(enCamino, 200, 'marcar en camino antes de cancelar');

  const cancelado = await llamar(`${urlBaseViaje}/cancelar`, {
    method: 'POST',
    token: chofer.token,
    body: { motivo: 'Problema mecánico' },
  });
  afirmarEstado(cancelado, 200, 'cancelar como chofer con el viaje en camino');
  assert.equal(cancelado.cuerpo.viaje.estado, 'CANCELADO_POR_CHOFER');
  assert.equal(cancelado.cuerpo.viaje.canceladoPorId, chofer.usuario.id);
  assert.equal(cancelado.cuerpo.viaje.motivoCancelacion, 'Problema mecánico');
  assert.notEqual(cancelado.cuerpo.viaje.cerradoEn, null);

  const perfil = await llamar(`${urlBase}/choferes/yo`, { token: chofer.token });
  afirmarEstado(perfil, 200, 'perfil del chofer tras cancelar');
  assert.equal(perfil.cuerpo.chofer.viajeActivoId, null);
  assert.equal(perfil.cuerpo.chofer.estado, 'DISPONIBLE');
});

test('soporte cancela por HTTP un viaje en curso; el administrador no puede', async (t) => {
  const { urlBase, admin, soporte, pasajero, chofer } = await prepararEscenario(t);
  const viaje = await crearViajeAsignado(urlBase, pasajero, chofer, 'autorizacion-soporte');
  const urlViaje = `${urlBase}/viajes/${viaje.id}`;

  for (const paso of ['en-camino', 'iniciar']) {
    const avance = await llamar(`${urlViaje}/${paso}`, { method: 'POST', token: chofer.token });
    afirmarEstado(avance, 200, `chofer ${paso}`);
  }

  const comoAdmin = await llamar(`${urlViaje}/cancelar`, {
    method: 'POST',
    token: admin.token,
    body: { motivo: 'Intento sin permiso' },
  });
  afirmarEstado(comoAdmin, 403, 'cancelar como administrador');

  const comoSoporte = await llamar(`${urlViaje}/cancelar`, {
    method: 'POST',
    token: soporte.token,
    body: { motivo: 'Emergencia reportada por el pasajero' },
  });
  afirmarEstado(comoSoporte, 200, 'cancelar como soporte');
  assert.equal(comoSoporte.cuerpo.viaje.estado, 'CANCELADO_POR_SOPORTE');
  assert.equal(comoSoporte.cuerpo.viaje.canceladoPorId, soporte.usuario.id);

  const perfil = await llamar(`${urlBase}/choferes/yo`, { token: chofer.token });
  assert.equal(perfil.cuerpo.chofer.viajeActivoId, null);
});
