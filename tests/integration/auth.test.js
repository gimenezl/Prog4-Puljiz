import assert from 'node:assert/strict';
import test from 'node:test';

import { composeApplication } from '../../src/composition-root.js';
import { ROLES, Usuario } from '../../src/domain/entities/usuario.js';
import { loadEnv } from '../../src/infrastructure/config/env.js';
import { detenerServidor, iniciarServidor } from '../helpers/http-server.js';

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';

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

async function llamar(url, { method = 'GET', token, body } = {}) {
  const headers = {};

  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;

  const respuesta = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const texto = await respuesta.text();

  return {
    respuesta,
    cuerpo: texto.length > 0 ? JSON.parse(texto) : null,
  };
}

function datosRegistro(sobrescrituras = {}) {
  return {
    email: 'ana@example.com',
    nombre: 'Ana',
    contrasena: 'Segura123',
    rol: 'PASAJERO',
    ...sobrescrituras,
  };
}

async function registrar(urlBase, datos = datosRegistro()) {
  const { respuesta, cuerpo } = await llamar(`${urlBase}/auth/registro`, {
    method: 'POST',
    body: datos,
  });

  return { respuesta, cuerpo };
}

async function iniciarSesion(urlBase, email, contrasena) {
  return llamar(`${urlBase}/auth/login`, {
    method: 'POST',
    body: { email, contrasena },
  });
}

test('registro devuelve solo datos públicos y normaliza el email', async (t) => {
  const { urlBase } = await crearAplicacion(t);

  const { respuesta, cuerpo } = await registrar(
    urlBase,
    datosRegistro({
      email: '  Ana.Perez@Example.COM ',
      nombre: '  Ana Pérez ',
    }),
  );

  assert.equal(respuesta.status, 201);
  assert.equal(cuerpo.usuario.email, 'ana.perez@example.com');
  assert.equal(cuerpo.usuario.nombre, 'Ana Pérez');
  assert.equal(cuerpo.usuario.rol, 'PASAJERO');
  assert.match(cuerpo.usuario.id, /^[0-9a-f-]{36}$/);
  assert.equal('contrasena' in cuerpo.usuario, false);
  assert.equal('credencial' in cuerpo.usuario, false);
  assert.equal(JSON.stringify(cuerpo).includes('Segura123'), false);
});

test('registro rechaza campos no declarados, roles privilegiados y duplicados', async (t) => {
  const { urlBase } = await crearAplicacion(t);

  const conCampoExtra = await registrar(urlBase, {
    ...datosRegistro(),
    admin: true,
  });
  assert.equal(conCampoExtra.respuesta.status, 400);
  assert.equal(conCampoExtra.cuerpo.error.codigo, 'DATOS_INVALIDOS');
  assert.match(conCampoExtra.cuerpo.error.mensaje, /campos no permitidos: admin/);

  const conRolPrivilegiado = await registrar(urlBase, {
    ...datosRegistro(),
    rol: 'ADMINISTRADOR',
  });
  assert.equal(conRolPrivilegiado.respuesta.status, 400);

  const conClaveDebil = await registrar(urlBase, {
    ...datosRegistro(),
    contrasena: 'corta1',
  });
  assert.equal(conClaveDebil.respuesta.status, 400);

  const primero = await registrar(urlBase);
  assert.equal(primero.respuesta.status, 201);

  const duplicado = await registrar(urlBase, {
    ...datosRegistro(),
    email: 'ANA@EXAMPLE.COM',
  });
  assert.equal(duplicado.respuesta.status, 409);
  assert.equal(duplicado.cuerpo.error.codigo, 'EMAIL_YA_REGISTRADO');
});

test('login exitoso emite un token utilizable y no revela la credencial', async (t) => {
  const { urlBase } = await crearAplicacion(t);
  await registrar(urlBase);

  const { respuesta, cuerpo } = await iniciarSesion(urlBase, 'ANA@example.com', 'Segura123');

  assert.equal(respuesta.status, 200);
  assert.equal(cuerpo.tipo, 'Bearer');
  assert.equal(typeof cuerpo.token, 'string');
  assert.equal(new Date(cuerpo.expiraEn).getTime() > Date.now(), true);
  assert.equal('credencial' in cuerpo.usuario, false);
  assert.equal(JSON.stringify(cuerpo).includes('fake$'), false);

  const perfil = await llamar(`${urlBase}/auth/yo`, { token: cuerpo.token });
  assert.equal(perfil.respuesta.status, 200);
  assert.equal(perfil.cuerpo.usuario.email, 'ana@example.com');
});

test('login devuelve el mismo error para email inexistente y contraseña incorrecta', async (t) => {
  const { urlBase } = await crearAplicacion(t);
  await registrar(urlBase);

  const inexistente = await iniciarSesion(urlBase, 'nadie@example.com', 'Segura123');
  const incorrecta = await iniciarSesion(urlBase, 'ana@example.com', 'Incorrecta123');

  for (const intento of [inexistente, incorrecta]) {
    assert.equal(intento.respuesta.status, 401);
    assert.equal(intento.cuerpo.error.codigo, 'CREDENCIALES_INVALIDAS');
    assert.equal(intento.cuerpo.error.mensaje, 'El email o la contraseña son incorrectos.');
  }
});

test('rechaza requests sin token o con un token inválido', async (t) => {
  const { urlBase } = await crearAplicacion(t);

  const sinToken = await llamar(`${urlBase}/auth/yo`);
  assert.equal(sinToken.respuesta.status, 401);
  assert.equal(sinToken.cuerpo.error.codigo, 'NO_AUTENTICADO');

  const tokenInvalido = await llamar(`${urlBase}/auth/yo`, { token: 'token-falso' });
  assert.equal(tokenInvalido.respuesta.status, 401);
  assert.equal(tokenInvalido.cuerpo.error.codigo, 'NO_AUTENTICADO');
});

test('aplica autorización por recurso y evita IDOR en lectura y edición', async (t) => {
  const { urlBase } = await crearAplicacion(t);

  const ana = await registrar(urlBase, datosRegistro());
  const bruno = await registrar(
    urlBase,
    datosRegistro({ email: 'bruno@example.com', nombre: 'Bruno', rol: 'CHOFER' }),
  );

  const sesionAna = await iniciarSesion(urlBase, 'ana@example.com', 'Segura123');

  const propio = await llamar(`${urlBase}/usuarios/${ana.cuerpo.usuario.id}`, {
    token: sesionAna.cuerpo.token,
  });
  assert.equal(propio.respuesta.status, 200);

  const ajeno = await llamar(`${urlBase}/usuarios/${bruno.cuerpo.usuario.id}`, {
    token: sesionAna.cuerpo.token,
  });
  assert.equal(ajeno.respuesta.status, 403);
  assert.equal(ajeno.cuerpo.error.codigo, 'NO_AUTORIZADO');

  const inexistente = await llamar(`${urlBase}/usuarios/99999999-9999-4999-8999-999999999999`, {
    token: sesionAna.cuerpo.token,
  });
  assert.equal(inexistente.respuesta.status, 404);
  assert.equal(inexistente.cuerpo.error.codigo, 'NO_ENCONTRADO');

  const edicionPropia = await llamar(`${urlBase}/usuarios/${ana.cuerpo.usuario.id}`, {
    method: 'PATCH',
    token: sesionAna.cuerpo.token,
    body: { nombre: 'Ana Actualizada' },
  });
  assert.equal(edicionPropia.respuesta.status, 200);
  assert.equal(edicionPropia.cuerpo.usuario.nombre, 'Ana Actualizada');

  const edicionAjena = await llamar(`${urlBase}/usuarios/${bruno.cuerpo.usuario.id}`, {
    method: 'PATCH',
    token: sesionAna.cuerpo.token,
    body: { nombre: 'Intento ajeno' },
  });
  assert.equal(edicionAjena.respuesta.status, 403);

  const intentoDeRol = await llamar(`${urlBase}/usuarios/${ana.cuerpo.usuario.id}`, {
    method: 'PATCH',
    token: sesionAna.cuerpo.token,
    body: { rol: 'ADMINISTRADOR' },
  });
  assert.equal(intentoDeRol.respuesta.status, 400);
  assert.equal(intentoDeRol.cuerpo.error.codigo, 'DATOS_INVALIDOS');

  const perfil = await llamar(`${urlBase}/auth/yo`, { token: sesionAna.cuerpo.token });
  assert.equal(perfil.cuerpo.usuario.rol, 'PASAJERO');
  assert.equal(perfil.cuerpo.usuario.nombre, 'Ana Actualizada');
});

test('un administrador puede ver cuentas ajenas pero no editarlas', async (t) => {
  const { urlBase, repositorioUsuarios, hasherContrasenas } = await crearAplicacion(t);

  const bruno = await registrar(
    urlBase,
    datosRegistro({ email: 'bruno@example.com', nombre: 'Bruno', rol: 'CHOFER' }),
  );

  await repositorioUsuarios.crear(
    new Usuario({
      id: ADMIN_ID,
      email: 'admin@example.com',
      nombre: 'Admin',
      credencial: await hasherContrasenas.hashear('Admin1234'),
      rol: ROLES.ADMINISTRADOR,
      creadoEn: new Date(),
    }),
  );

  const sesionAdmin = await iniciarSesion(urlBase, 'admin@example.com', 'Admin1234');
  assert.equal(sesionAdmin.respuesta.status, 200);

  const lectura = await llamar(`${urlBase}/usuarios/${bruno.cuerpo.usuario.id}`, {
    token: sesionAdmin.cuerpo.token,
  });
  assert.equal(lectura.respuesta.status, 200);
  assert.equal(lectura.cuerpo.usuario.email, 'bruno@example.com');

  const edicion = await llamar(`${urlBase}/usuarios/${bruno.cuerpo.usuario.id}`, {
    method: 'PATCH',
    token: sesionAdmin.cuerpo.token,
    body: { nombre: 'Editado por admin' },
  });
  assert.equal(edicion.respuesta.status, 403);
});

test('el login tiene un rate limit independiente del límite global', async (t) => {
  const { urlBase } = await crearAplicacion(t, { LOGIN_RATE_LIMIT_MAX: '2' });
  await registrar(urlBase);

  const primero = await iniciarSesion(urlBase, 'ana@example.com', 'Incorrecta123');
  const segundo = await iniciarSesion(urlBase, 'ana@example.com', 'Incorrecta123');
  const tercero = await iniciarSesion(urlBase, 'ana@example.com', 'Incorrecta123');

  assert.equal(primero.respuesta.status, 401);
  assert.equal(segundo.respuesta.status, 401);
  assert.equal(tercero.respuesta.status, 429);
  assert.equal(tercero.cuerpo.error.codigo, 'DEMASIADAS_SOLICITUDES');
  assert.equal(typeof tercero.cuerpo.requestId, 'string');
});
