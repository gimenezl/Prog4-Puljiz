import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { composeApplication } from '../../src/composition-root.js';
import { ROLES, Usuario } from '../../src/domain/entities/usuario.js';
import { loadEnv } from '../../src/infrastructure/config/env.js';
import { detenerServidor, iniciarServidor } from '../helpers/http-server.js';
import { datosDeVehiculoDePrueba } from '../helpers/vehiculos-kit.js';

const ORIGEN = { lat: -34.6037, lng: -58.3816 };
const DESTINO = { lat: -34.6083, lng: -58.3712 };

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

/** App en memoria con un pasajero, otro pasajero, un chofer listo, soporte y admin. */
async function prepararEscenario(t) {
  const entorno = loadEnv({
    NODE_ENV: 'test',
    HOST: '127.0.0.1',
    PORT: '3000',
    LOG_LEVEL: 'silent',
    ADAPTERS_MODE: 'fake',
    VIAJES_RATE_LIMIT_MAX: '1000',
  });
  const composicion = composeApplication(entorno);
  const { servidor, urlBase } = await iniciarServidor(composicion.app);

  t.after(async () => {
    await detenerServidor(servidor);
    await composicion.shutdown();
  });

  async function cuenta(rol) {
    const usuario = new Usuario({
      id: randomUUID(),
      email: `${rol.toLowerCase()}-${randomUUID()}@example.com`,
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

  const [pasajero, otroPasajero, soporte, admin] = await Promise.all([
    cuenta(ROLES.PASAJERO),
    cuenta(ROLES.PASAJERO),
    cuenta(ROLES.OPERADOR_SOPORTE),
    cuenta(ROLES.ADMINISTRADOR),
  ]);

  // El chofer se registra por la API para que tenga su perfil operativo.
  const email = `chofer-${randomUUID()}@example.com`;
  await llamar(`${urlBase}/auth/registro`, {
    method: 'POST',
    body: { email, nombre: 'Chofer', contrasena: 'Segura123', rol: 'CHOFER' },
  });
  const chofer = (
    await llamar(`${urlBase}/auth/login`, {
      method: 'POST',
      body: { email, contrasena: 'Segura123' },
    })
  ).cuerpo;

  for (const [method, ruta, token, body] of [
    ['PUT', '/choferes/yo/vehiculo', chofer.token, datosDeVehiculoDePrueba()],
    ['PATCH', `/choferes/${chofer.usuario.id}/habilitacion`, admin.token, { habilitado: true }],
    ['PATCH', '/choferes/yo', chofer.token, { disponible: true }],
    ['PUT', '/choferes/yo/ubicacion', chofer.token, ORIGEN],
  ]) {
    const respuesta = await llamar(`${urlBase}${ruta}`, { method, token, body });
    assert.ok(respuesta.status < 300, `${method} ${ruta} -> ${respuesta.status}`);
  }

  async function pedirViaje(sesion) {
    const respuesta = await llamar(`${urlBase}/viajes`, {
      method: 'POST',
      token: sesion.token,
      headers: { 'idempotency-key': randomUUID() },
      body: { origen: ORIGEN, destino: DESTINO },
    });
    assert.equal(respuesta.status, 201);
    return respuesta.cuerpo.viaje;
  }

  return { urlBase, pasajero, otroPasajero, chofer, soporte, admin, pedirViaje };
}

test('historial: cada uno ve solo sus viajes, paginados por cursor', async (t) => {
  const { urlBase, pasajero, otroPasajero, chofer, pedirViaje } = await prepararEscenario(t);

  const propios = [];
  for (let i = 0; i < 5; i += 1) propios.push(await pedirViaje(pasajero));
  const ajeno = await pedirViaje(otroPasajero);

  // El chofer acepta uno de los del pasajero: aparece en el historial de los dos.
  const aceptado = propios[1];
  assert.equal(
    (
      await llamar(`${urlBase}/viajes/${aceptado.id}/aceptar`, {
        method: 'POST',
        token: chofer.token,
      })
    ).status,
    200,
  );

  // Recorre el historial del pasajero de a 2.
  const vistos = [];
  let cursor = null;
  do {
    const consulta = cursor ? `?limite=2&cursor=${cursor}` : '?limite=2';
    const pagina = await llamar(`${urlBase}/viajes${consulta}`, { token: pasajero.token });
    assert.equal(pagina.status, 200);
    vistos.push(...pagina.cuerpo.viajes.map((viaje) => viaje.id));
    cursor = pagina.cuerpo.siguienteCursor;
  } while (cursor);

  assert.deepEqual(vistos.sort(), propios.map((viaje) => viaje.id).sort());
  assert.equal(vistos.includes(ajeno.id), false);

  const delChofer = await llamar(`${urlBase}/viajes`, { token: chofer.token });
  assert.deepEqual(
    delChofer.cuerpo.viajes.map((viaje) => viaje.id),
    [aceptado.id],
  );
  assert.equal(delChofer.cuerpo.siguienteCursor, null);

  const filtrado = await llamar(`${urlBase}/viajes?estado=ASIGNADO`, { token: pasajero.token });
  assert.deepEqual(
    filtrado.cuerpo.viajes.map((viaje) => viaje.id),
    [aceptado.id],
  );
});

test('historial: rechaza a soporte y al administrador, y valida los parámetros', async (t) => {
  const { urlBase, pasajero, soporte, admin } = await prepararEscenario(t);

  for (const sesion of [soporte, admin]) {
    const respuesta = await llamar(`${urlBase}/viajes`, { token: sesion.token });
    assert.equal(respuesta.status, 403);
    assert.equal(respuesta.cuerpo.error.codigo, 'NO_AUTORIZADO');
  }

  for (const consulta of [
    '?cursor=no-es-un-cursor',
    `?cursor=${Buffer.from('{"t":"x","id":"y"}').toString('base64url')}`,
    '?limite=0',
    '?limite=500',
    '?estado=INVENTADO',
    '?pagina=2',
  ]) {
    const respuesta = await llamar(`${urlBase}/viajes${consulta}`, { token: pasajero.token });
    assert.equal(respuesta.status, 400, consulta);
    assert.equal(respuesta.cuerpo.error.codigo, 'DATOS_INVALIDOS', consulta);
  }

  assert.equal((await llamar(`${urlBase}/viajes`)).status, 401);
});

test('viajes activos: soporte y administración ven los activos de todos, sin los terminados', async (t) => {
  const { urlBase, pasajero, otroPasajero, chofer, soporte, admin, pedirViaje } =
    await prepararEscenario(t);

  const activo = await pedirViaje(pasajero);
  const deOtro = await pedirViaje(otroPasajero);
  const cancelado = await pedirViaje(pasajero);
  await llamar(`${urlBase}/viajes/${cancelado.id}/cancelar`, {
    method: 'POST',
    token: soporte.token,
    body: { motivo: 'Pedido duplicado' },
  });

  for (const sesion of [soporte, admin]) {
    const respuesta = await llamar(`${urlBase}/viajes/activos`, { token: sesion.token });
    assert.equal(respuesta.status, 200);
    assert.deepEqual(
      respuesta.cuerpo.viajes.map((viaje) => viaje.id).sort(),
      [activo.id, deOtro.id].sort(),
    );
  }

  for (const sesion of [pasajero, chofer]) {
    const respuesta = await llamar(`${urlBase}/viajes/activos`, { token: sesion.token });
    assert.equal(respuesta.status, 403);
  }
});
