import assert from 'node:assert/strict';
import test from 'node:test';

import { composeApplication } from '../../src/composition-root.js';
import { ROLES, Usuario } from '../../src/domain/entities/usuario.js';
import { loadEnv } from '../../src/infrastructure/config/env.js';
import { detenerServidor, iniciarServidor } from '../helpers/http-server.js';

const ADMIN_ID = '22222222-2222-4222-8222-222222222222';
const ORIGEN = { lat: -34.6037, lng: -58.3816 };
const DESTINO = { lat: -34.6083, lng: -58.3712 };
const CRITERIO = {
  tipo: 'POLIGONO',
  puntos: [
    { lat: -34.62, lng: -58.4 },
    { lat: -34.59, lng: -58.4 },
    { lat: -34.59, lng: -58.36 },
    { lat: -34.62, lng: -58.36 },
  ],
};

function cargarEntorno() {
  return loadEnv({
    NODE_ENV: 'test',
    HOST: '127.0.0.1',
    PORT: '3000',
    LOG_LEVEL: 'silent',
    ADAPTERS_MODE: 'fake',
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

async function crearAdmin(composicion, urlBase) {
  await composicion.repositorioUsuarios.crear(
    new Usuario({
      id: ADMIN_ID,
      email: 'admin@cotizaciones.test',
      nombre: 'Admin',
      credencial: await composicion.hasherContrasenas.hashear('Admin1234'),
      rol: ROLES.ADMINISTRADOR,
      creadoEn: new Date(),
    }),
  );

  const sesion = await llamar(`${urlBase}/auth/login`, {
    method: 'POST',
    body: { email: 'admin@cotizaciones.test', contrasena: 'Admin1234' },
  });

  assert.equal(sesion.respuesta.status, 200);
  return sesion.cuerpo.token;
}

async function crearPasajero(urlBase, email) {
  const registro = await llamar(`${urlBase}/auth/registro`, {
    method: 'POST',
    body: { email, nombre: 'Pasajero', contrasena: 'Segura123', rol: ROLES.PASAJERO },
  });
  assert.equal(registro.respuesta.status, 201);

  const sesion = await llamar(`${urlBase}/auth/login`, {
    method: 'POST',
    body: { email, contrasena: 'Segura123' },
  });
  assert.equal(sesion.respuesta.status, 200);
  return sesion.cuerpo.token;
}

async function publicarConfiguracion(urlBase, tokenAdmin) {
  const zona = await llamar(`${urlBase}/admin/configuracion/zonas`, {
    method: 'POST',
    token: tokenAdmin,
    body: { nombre: 'Centro', criterio: CRITERIO },
  });
  assert.equal(zona.respuesta.status, 201);

  const tarifa = await llamar(`${urlBase}/admin/configuracion/tarifas`, {
    method: 'POST',
    token: tokenAdmin,
    body: {
      baseCentavos: 100000,
      porKmCentavos: 50000,
      porMinutoCentavos: 10000,
      precioMaximoCentavos: 1000000,
    },
  });
  assert.equal(tarifa.respuesta.status, 201);

  const publicacionTarifa = await llamar(
    `${urlBase}/admin/configuracion/tarifas/${tarifa.cuerpo.tarifa.id}/publicar`,
    { method: 'POST', token: tokenAdmin, body: {} },
  );
  assert.equal(publicacionTarifa.respuesta.status, 200);

  const regla = await llamar(`${urlBase}/admin/configuracion/reglas`, {
    method: 'POST',
    token: tokenAdmin,
    body: {
      umbralInferior: '0.5',
      umbralSuperior: '3',
      multiplicadorMinimo: '1',
      multiplicadorMaximo: '2',
      escalaMultiplicador: 2,
    },
  });
  assert.equal(regla.respuesta.status, 201);

  const publicacionRegla = await llamar(
    `${urlBase}/admin/configuracion/reglas/${regla.cuerpo.regla.id}/publicar`,
    { method: 'POST', token: tokenAdmin, body: { motivo: 'Regla inicial.' } },
  );
  assert.equal(publicacionRegla.respuesta.status, 200);

  return {
    zona: zona.cuerpo.zona,
    tarifa: publicacionTarifa.cuerpo.tarifa,
    regla: publicacionRegla.cuerpo.regla,
  };
}

test('flujo HTTP completo: configurar, cotizar, confirmar y reutilizar la clave', async (t) => {
  const app = await crearAplicacion(t);
  const tokenAdmin = await crearAdmin(app, app.urlBase);
  const tokenPasajero = await crearPasajero(app.urlBase, 'pasajero@cotizaciones.test');
  const configuracion = await publicarConfiguracion(app.urlBase, tokenAdmin);

  assert.equal(configuracion.tarifa.version, 1);
  assert.equal(configuracion.regla.version, 1);
  assert.equal(configuracion.tarifa.estado, 'PUBLICADA');

  const cotizacion = await llamar(`${app.urlBase}/cotizaciones`, {
    method: 'POST',
    token: tokenPasajero,
    body: { origen: ORIGEN, destino: DESTINO },
  });
  assert.equal(cotizacion.respuesta.status, 201);
  assert.equal(cotizacion.cuerpo.cotizacion.multiplicador, '1.00');
  assert.equal(cotizacion.cuerpo.cotizacion.zonaId, configuracion.zona.id);
  assert.equal(cotizacion.cuerpo.cotizacion.estado, 'VIGENTE');

  const id = cotizacion.cuerpo.cotizacion.id;
  const confirmacion = await llamar(`${app.urlBase}/cotizaciones/${id}/confirmar`, {
    method: 'POST',
    token: tokenPasajero,
    headers: { 'idempotency-key': 'confirmar-http-1' },
    body: {},
  });
  assert.equal(confirmacion.respuesta.status, 201);
  assert.equal(
    confirmacion.cuerpo.viaje.precioFijadoCentavos,
    cotizacion.cuerpo.cotizacion.precioCentavos,
  );
  assert.equal(confirmacion.cuerpo.viaje.cotizacionId, id);

  const reintento = await llamar(`${app.urlBase}/cotizaciones/${id}/confirmar`, {
    method: 'POST',
    token: tokenPasajero,
    headers: { 'idempotency-key': 'confirmar-http-1' },
    body: {},
  });
  assert.equal(reintento.respuesta.status, 200);
  assert.equal(reintento.respuesta.headers.get('idempotency-replayed'), 'true');
  assert.deepEqual(reintento.cuerpo.viaje, confirmacion.cuerpo.viaje);

  const consulta = await llamar(`${app.urlBase}/cotizaciones/${id}`, { token: tokenPasajero });
  assert.equal(consulta.respuesta.status, 200);
  assert.equal(consulta.cuerpo.cotizacion.estado, 'CONFIRMADA');

  const listado = await llamar(`${app.urlBase}/cotizaciones`, { token: tokenPasajero });
  assert.equal(listado.respuesta.status, 200);
  assert.equal(listado.cuerpo.cotizaciones.length, 1);
});

test('la API rechaza accesos y datos inválidos', async (t) => {
  const app = await crearAplicacion(t);
  const tokenAdmin = await crearAdmin(app, app.urlBase);
  const tokenPasajero = await crearPasajero(app.urlBase, 'pasajero@cotizaciones.test');
  const otroPasajero = await crearPasajero(app.urlBase, 'otro@cotizaciones.test');

  const sinAutorizacion = await llamar(`${app.urlBase}/admin/configuracion/zonas`, {
    token: tokenPasajero,
  });
  assert.equal(sinAutorizacion.respuesta.status, 403);

  const sinToken = await llamar(`${app.urlBase}/cotizaciones`, {
    method: 'POST',
    body: { origen: ORIGEN, destino: DESTINO },
  });
  assert.equal(sinToken.respuesta.status, 401);

  await publicarConfiguracion(app.urlBase, tokenAdmin);
  const cotizacion = await llamar(`${app.urlBase}/cotizaciones`, {
    method: 'POST',
    token: tokenPasajero,
    body: { origen: ORIGEN, destino: DESTINO },
  });
  const id = cotizacion.cuerpo.cotizacion.id;

  const ajena = await llamar(`${app.urlBase}/cotizaciones/${id}`, { token: otroPasajero });
  assert.equal(ajena.respuesta.status, 403);

  const sinClave = await llamar(`${app.urlBase}/cotizaciones/${id}/confirmar`, {
    method: 'POST',
    token: tokenPasajero,
    body: {},
  });
  assert.equal(sinClave.respuesta.status, 400);
  assert.equal(sinClave.cuerpo.error.codigo, 'CLAVE_DE_IDEMPOTENCIA_REQUERIDA');

  const cuerpoInvalido = await llamar(`${app.urlBase}/cotizaciones`, {
    method: 'POST',
    token: tokenPasajero,
    body: { origen: { lat: 100, lng: 0 }, destino: DESTINO },
  });
  assert.equal(cuerpoInvalido.respuesta.status, 400);

  const fueraDeCobertura = await llamar(`${app.urlBase}/cotizaciones`, {
    method: 'POST',
    token: tokenPasajero,
    body: { origen: { lat: 0, lng: 0 }, destino: DESTINO },
  });
  assert.equal(fueraDeCobertura.respuesta.status, 422);
  assert.equal(fueraDeCobertura.cuerpo.error.codigo, 'FUERA_DE_COBERTURA');

  const inexistente = await llamar(
    `${app.urlBase}/cotizaciones/00000000-0000-4000-8000-999999999999`,
    {
      token: tokenPasajero,
    },
  );
  assert.equal(inexistente.respuesta.status, 404);
});
