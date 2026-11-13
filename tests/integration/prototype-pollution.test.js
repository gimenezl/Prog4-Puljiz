import assert from 'node:assert/strict';
import test from 'node:test';

import { composeApplication } from '../../src/composition-root.js';
import { loadEnv } from '../../src/infrastructure/config/env.js';
import { detenerServidor, iniciarServidor } from '../helpers/http-server.js';

const ORIGEN = { lat: -34.6037, lng: -58.3816 };
const DESTINO = { lat: -34.6083, lng: -58.3712 };
const CLAVES_DE_PRUEBA = ['contaminado', 'polluted'];

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

async function llamarConJsonCrudo(url, { method = 'GET', token, cuerpoCrudo, headers = {} } = {}) {
  const cabeceras = { 'content-type': 'application/json', ...headers };
  if (token) cabeceras.authorization = `Bearer ${token}`;

  const respuesta = await fetch(url, {
    method,
    headers: cabeceras,
    body: cuerpoCrudo,
  });
  const texto = await respuesta.text();

  return {
    respuesta,
    cuerpo: texto.length > 0 ? JSON.parse(texto) : null,
  };
}

async function registrarPasajero(urlBase, email = 'prototipos@example.com') {
  const registro = await llamar(`${urlBase}/auth/registro`, {
    method: 'POST',
    body: { email, nombre: 'Pasajero', contrasena: 'Segura123', rol: 'PASAJERO' },
  });
  assert.equal(registro.respuesta.status, 201);

  const sesion = await llamar(`${urlBase}/auth/login`, {
    method: 'POST',
    body: { email, contrasena: 'Segura123' },
  });
  assert.equal(sesion.respuesta.status, 200);
  return sesion.cuerpo.token;
}

/**
 * Comprueba la integridad del prototipo global. No alcanza con que la
 * petición responda 400: el test falla si alguna capa mezcló el cuerpo con
 * `Object.prototype` o reemplazó el prototipo de un objeto común.
 */
function afirmarPrototipoGlobalIntacto() {
  for (const clave of CLAVES_DE_PRUEBA) {
    assert.equal(
      Object.hasOwn(Object.prototype, clave),
      false,
      `Object.prototype recibió la propiedad propia "${clave}"`,
    );
    assert.equal({}[clave], undefined, `un objeto común heredó "${clave}"`);
    assert.equal(Object.prototype[clave], undefined);
  }

  assert.equal(Object.getPrototypeOf({}), Object.prototype);
  assert.equal(Object.prototype.constructor, Object);
}

function payloadRegistro(camposExtra) {
  return JSON.stringify({
    email: 'proto@example.com',
    nombre: 'Proto',
    contrasena: 'Segura123',
    rol: 'PASAJERO',
    ...camposExtra,
  });
}

test('rechaza __proto__ y constructor.prototype en la raíz del cuerpo sin contaminar', async (t) => {
  const { urlBase } = await crearAplicacion(t);

  const casos = [
    {
      nombre: '__proto__ en la raíz',
      cuerpo: payloadRegistro({ __proto__: { contaminado: 'x' } }),
    },
    {
      nombre: 'constructor.prototype en la raíz',
      cuerpo: payloadRegistro({ constructor: { prototype: { contaminado: 'x' } } }),
    },
  ];

  // JSON.stringify no crea una propiedad propia para __proto__, por eso los
  // cuerpos se construyen como texto y se envían sin volver a serializar.
  casos[0].cuerpo = `{
    "email": "proto@example.com",
    "nombre": "Proto",
    "contrasena": "Segura123",
    "rol": "PASAJERO",
    "__proto__": { "contaminado": "x" }
  }`;
  casos[1].cuerpo = `{
    "email": "proto@example.com",
    "nombre": "Proto",
    "contrasena": "Segura123",
    "rol": "PASAJERO",
    "constructor": { "prototype": { "contaminado": "x" } }
  }`;

  for (const caso of casos) {
    const { respuesta, cuerpo } = await llamarConJsonCrudo(`${urlBase}/auth/registro`, {
      method: 'POST',
      cuerpoCrudo: caso.cuerpo,
    });

    assert.equal(respuesta.status, 400, caso.nombre);
    assert.equal(cuerpo.error.codigo, 'DATOS_INVALIDOS', caso.nombre);
    afirmarPrototipoGlobalIntacto();
  }
});

test('rechaza __proto__ y constructor.prototype anidados en origen y destino', async (t) => {
  const { urlBase } = await crearAplicacion(t);
  const token = await registrarPasajero(urlBase);

  const cuerpos = [
    {
      nombre: '__proto__ en origen',
      cuerpo: `{
        "origen": { "lat": -34.6037, "lng": -58.3816, "__proto__": { "contaminado": "x" } },
        "destino": { "lat": -34.6083, "lng": -58.3712 }
      }`,
    },
    {
      nombre: 'constructor.prototype en origen',
      cuerpo: `{
        "origen": {
          "lat": -34.6037,
          "lng": -58.3816,
          "constructor": { "prototype": { "contaminado": "x" } }
        },
        "destino": { "lat": -34.6083, "lng": -58.3712 }
      }`,
    },
    {
      nombre: '__proto__ en destino',
      cuerpo: `{
        "origen": { "lat": -34.6037, "lng": -58.3816 },
        "destino": { "lat": -34.6083, "lng": -58.3712, "__proto__": { "contaminado": "x" } }
      }`,
    },
    {
      nombre: 'constructor.prototype en destino',
      cuerpo: `{
        "origen": { "lat": -34.6037, "lng": -58.3816 },
        "destino": {
          "lat": -34.6083,
          "lng": -58.3712,
          "constructor": { "prototype": { "contaminado": "x" } }
        }
      }`,
    },
  ];

  for (const [indice, caso] of cuerpos.entries()) {
    const { respuesta, cuerpo } = await llamarConJsonCrudo(`${urlBase}/viajes`, {
      method: 'POST',
      token,
      headers: { 'Idempotency-Key': `proto-${indice}` },
      cuerpoCrudo: caso.cuerpo,
    });

    assert.equal(respuesta.status, 400, caso.nombre);
    assert.equal(cuerpo.error.codigo, 'DATOS_INVALIDOS', caso.nombre);
    afirmarPrototipoGlobalIntacto();
  }
});

test('la defensa es el esquema estricto, no una lista negra de nombres peligrosos', async (t) => {
  const { urlBase } = await crearAplicacion(t);

  const conCampoExtra = await llamar(`${urlBase}/auth/registro`, {
    method: 'POST',
    body: {
      email: 'extra@example.com',
      nombre: 'Extra',
      contrasena: 'Segura123',
      rol: 'PASAJERO',
      campoExtra: true,
    },
  });

  assert.equal(conCampoExtra.respuesta.status, 400);
  assert.equal(conCampoExtra.cuerpo.error.codigo, 'DATOS_INVALIDOS');
  assert.match(conCampoExtra.cuerpo.error.mensaje, /campos no permitidos: campoExtra/);

  // Un valor con el texto "__proto__" es un dato legítimo: no se bloquea por
  // su nombre y tampoco debe tener efecto sobre el prototipo.
  const nombreInocuo = await llamar(`${urlBase}/auth/registro`, {
    method: 'POST',
    body: {
      email: 'inocuo@example.com',
      nombre: '__proto__',
      contrasena: 'Segura123',
      rol: 'PASAJERO',
    },
  });

  assert.equal(nombreInocuo.respuesta.status, 201);
  assert.equal(nombreInocuo.cuerpo.usuario.nombre, '__proto__');
  afirmarPrototipoGlobalIntacto();
});

test('la aplicación sigue funcionando después de los intentos de contaminación', async (t) => {
  const { urlBase } = await crearAplicacion(t);
  const token = await registrarPasajero(urlBase, 'funcional@example.com');

  const creacion = await llamar(`${urlBase}/viajes`, {
    method: 'POST',
    token,
    headers: { 'Idempotency-Key': 'post-proto' },
    body: { origen: ORIGEN, destino: DESTINO },
  });

  assert.equal(creacion.respuesta.status, 201);
  assert.equal(creacion.cuerpo.viaje.estado, 'SOLICITADO');

  const lectura = await llamar(`${urlBase}/viajes/${creacion.cuerpo.viaje.id}`, { token });
  assert.equal(lectura.respuesta.status, 200);
  assert.equal(lectura.cuerpo.viaje.id, creacion.cuerpo.viaje.id);
  afirmarPrototipoGlobalIntacto();
});
