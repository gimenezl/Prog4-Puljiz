/**
 * Casos PM-10 a PM-14: invariantes en PostgreSQL, rate limits y defensa
 * contra prototype pollution.
 *
 * Los límites se prueban contra una segunda instancia en memoria con topes
 * bajos. Así el flujo principal no consume cupos y los contadores arrancan
 * limpios en cada ejecución.
 */

import { aceptarViaje, crearViaje, finalizarViaje } from './flujos.js';
import { usuario } from './contexto.js';
import {
  afirmar,
  afirmarCodigo,
  afirmarEstado,
  afirmarIgual,
  claveDePrueba,
  evidencia,
} from './utilidades.js';

function contextoAuxiliar(contexto) {
  afirmar(
    contexto.auxiliar,
    'No se inició la instancia auxiliar de rate limits (revisá el bootstrap del script).',
  );
  return contexto.auxiliar;
}

function enteroDeEncabezado(encabezados, nombre) {
  const valor = encabezados[nombre];
  return valor === undefined ? NaN : Number.parseInt(valor, 10);
}

export const casosSeguridad = [
  {
    id: 'PM-10',
    titulo: 'Invariantes del cobro y de la idempotencia en PostgreSQL',
    requierePostgres: true,
    async ejecutar(contexto) {
      const { id, viaje } = await crearViaje(contexto);
      await aceptarViaje(contexto, id, 'chofer1');
      const { cobro, clave } = await finalizarViaje(contexto, id, {
        clave: claveDePrueba(contexto, 'pm10-final'),
      });

      const baseDeDatos = contexto.dependencias.baseDeDatos;
      const { rows: cobros } = await baseDeDatos.query(
        `SELECT viaje_id, monto_centavos, estado, referencia, cobrado_en
           FROM cobros_simulados
          WHERE viaje_id = $1`,
        [id],
      );

      afirmarIgual(cobros.length, 1, 'Debe existir exactamente una fila de cobro');
      afirmar(cobros[0].estado === 'COBRADO', 'El cobro persistido no está COBRADO.');
      afirmar(cobros[0].referencia === `SIM-${id}`, 'La referencia persistida no es determinista.');
      afirmar(
        cobros[0].monto_centavos === viaje.precioFijadoCentavos,
        'El monto persistido no coincide.',
      );
      afirmar(cobros[0].cobrado_en instanceof Date, 'El cobro no tiene fecha persistida.');

      const { rows: conteo } = await baseDeDatos.query(
        `SELECT COUNT(*)::int AS cobros
           FROM cobros_simulados
          WHERE viaje_id = $1`,
        [id],
      );
      afirmarIgual(conteo[0].cobros, 1, 'El conteo de cobros por viaje debe ser 1');

      const { rows: restricciones } = await baseDeDatos.query(
        `SELECT conname, contype
           FROM pg_constraint
          WHERE conrelid = 'cobros_simulados'::regclass`,
      );
      afirmar(
        restricciones.some(
          (fila) => fila.conname === 'cobros_simulados_viaje_id_key' && fila.contype === 'u',
        ),
        'Falta la restricción UNIQUE cobros_simulados_viaje_id_key.',
      );

      const { rows: indices } = await baseDeDatos.query(
        `SELECT indexname
           FROM pg_indexes
          WHERE tablename = 'cobros_simulados'`,
      );
      const nombresIndices = indices.map((fila) => fila.indexname);

      for (const indice of [
        'cobros_simulados_pkey',
        'cobros_simulados_viaje_id_key',
        'cobros_simulados_estado_idx',
      ]) {
        afirmar(nombresIndices.includes(indice), `Falta el índice ${indice}.`);
      }

      const { rows: viajes } = await baseDeDatos.query(
        `SELECT estado, cerrado_en FROM viajes WHERE id = $1`,
        [id],
      );
      afirmar(viajes[0]?.estado === 'FINALIZADO', 'El viaje persistido no está FINALIZADO.');
      afirmar(viajes[0]?.cerrado_en instanceof Date, 'El viaje no tiene cerrado_en persistido.');

      const { rows: choferes } = await baseDeDatos.query(
        `SELECT habilitado, disponible, viaje_activo_id
           FROM choferes
          WHERE usuario_id = $1`,
        [usuario(contexto, 'chofer1').id],
      );
      afirmar(choferes[0]?.habilitado === true, 'El chofer perdió la habilitación.');
      afirmar(choferes[0]?.disponible === true, 'El chofer perdió la disponibilidad.');
      afirmar(choferes[0]?.viaje_activo_id === null, 'El chofer conserva viaje_activo_id.');

      const alcance = `viaje:finalizar:${usuario(contexto, 'chofer1').id}`;
      const { rows: claves } = await baseDeDatos.query(
        `SELECT clave, hash_contenido, vence_en > now() AS vigente
           FROM claves_idempotencia
          WHERE alcance = $1 AND clave = $2`,
        [alcance, clave],
      );
      afirmarIgual(claves.length, 1, 'Debe existir un registro de idempotencia');
      afirmar(claves[0].vigente === true, 'La clave de idempotencia no está vigente.');
      afirmar(
        typeof claves[0].hash_contenido === 'string' && claves[0].hash_contenido.length === 64,
        'El hash de idempotencia no tiene el formato esperado.',
      );

      const { rows: huerfanos } = await baseDeDatos.query(
        `SELECT COUNT(*)::int AS huerfanos
           FROM cobros_simulados c
           LEFT JOIN viajes v ON v.id = c.viaje_id
          WHERE v.id IS NULL`,
      );
      afirmarIgual(huerfanos[0].huerfanos, 0, 'No debe haber cobros huérfanos');

      afirmar(cobro.id, 'El cobro de la respuesta no tiene identificador.');
      evidencia(
        contexto,
        `PostgreSQL: 1 cobro, UNIQUE viaje_id, viaje FINALIZADO, chofer libre, clave vigente`,
      );
    },
  },
  {
    id: 'PM-11',
    titulo: 'Rate limit de registro y encabezados informativos',
    async ejecutar(contexto) {
      const auxiliar = contextoAuxiliar(contexto);
      const respuestas = [];

      for (let intento = 1; intento <= 3; intento += 1) {
        respuestas.push(
          await auxiliar.solicitar('/auth/registro', {
            metodo: 'POST',
            cuerpo: {
              email: `verif-${auxiliar.sufijo}-registro-${intento}@prog4.test`,
              nombre: `Registro ${intento}`,
              contrasena: auxiliar.password,
              rol: 'PASAJERO',
            },
          }),
        );
      }

      afirmarEstado(respuestas[0], 201, 'primer registro dentro del límite');
      afirmarEstado(respuestas[1], 201, 'segundo registro dentro del límite');
      afirmarEstado(respuestas[2], 429, 'tercer registro por encima del límite');
      afirmarCodigo(respuestas[2], 'DEMASIADAS_SOLICITUDES', 'rate limit de registro');

      afirmarIgual(
        enteroDeEncabezado(respuestas[0].encabezados, 'ratelimit-limit'),
        2,
        'RateLimit-Limit del registro',
      );
      afirmar(
        enteroDeEncabezado(respuestas[0].encabezados, 'ratelimit-remaining') >= 0,
        'Falta RateLimit-Remaining en el registro exitoso.',
      );
      afirmar(
        enteroDeEncabezado(respuestas[0].encabezados, 'ratelimit-reset') > 0,
        'Falta RateLimit-Reset en el registro exitoso.',
      );
      afirmar(
        enteroDeEncabezado(respuestas[2].encabezados, 'retry-after') > 0,
        'La respuesta 429 no incluye Retry-After.',
      );

      evidencia(contexto, 'Registro: límite 2; tercer intento 429 con Retry-After');
    },
  },
  {
    id: 'PM-12',
    titulo: 'Rate limit compartido por operaciones de viajes',
    async ejecutar(contexto) {
      const auxiliar = contextoAuxiliar(contexto);
      const pasajero = usuario(auxiliar, 'pasajero');
      const creacion = await auxiliar.solicitar('/viajes', {
        metodo: 'POST',
        token: pasajero.token,
        headers: { 'idempotency-key': claveDePrueba(auxiliar, 'pm12-crear') },
        cuerpo: {
          origen: { lat: -34.6037, lng: -58.3816 },
          destino: { lat: -34.6083, lng: -58.3712 },
        },
      });

      afirmarEstado(creacion, 201, 'creación dentro del límite de viajes');
      afirmarIgual(
        enteroDeEncabezado(creacion.encabezados, 'ratelimit-limit'),
        3,
        'RateLimit-Limit de viajes',
      );

      const inexistente = '33333333-3333-4333-8333-333333333333';
      const dentroDelLimite = [];

      for (let intento = 0; intento < 2; intento += 1) {
        dentroDelLimite.push(
          await auxiliar.solicitar(`/viajes/${inexistente}/aceptar`, {
            metodo: 'POST',
            token: pasajero.token,
          }),
        );
      }

      for (const respuesta of dentroDelLimite) {
        afirmarEstado(respuesta, 403, 'operación de viaje dentro del límite');
      }

      const bloqueada = await auxiliar.solicitar(`/viajes/${inexistente}/aceptar`, {
        metodo: 'POST',
        token: pasajero.token,
      });
      afirmarEstado(bloqueada, 429, 'operación de viaje por encima del límite');
      afirmarCodigo(bloqueada, 'DEMASIADAS_SOLICITUDES', 'rate limit de viajes');
      afirmar(
        enteroDeEncabezado(bloqueada.encabezados, 'retry-after') > 0,
        'La respuesta 429 de viajes no incluye Retry-After.',
      );

      evidencia(contexto, 'Viajes: crear + aceptar comparten límite 3; siguiente 429');
    },
  },
  {
    id: 'PM-13',
    titulo: 'Rate limit de intentos fallidos de login',
    async ejecutar(contexto) {
      const auxiliar = contextoAuxiliar(contexto);
      const pasajero = usuario(auxiliar, 'pasajero');
      const fallidos = [];

      for (let intento = 0; intento < 3; intento += 1) {
        fallidos.push(
          await auxiliar.solicitar('/auth/login', {
            metodo: 'POST',
            cuerpo: { email: pasajero.email, contrasena: 'Incorrecta123' },
          }),
        );
      }

      for (const respuesta of fallidos) {
        afirmarEstado(respuesta, 401, 'login fallido dentro del límite');
        afirmarCodigo(respuesta, 'CREDENCIALES_INVALIDAS', 'login fallido');
      }

      afirmarIgual(
        enteroDeEncabezado(fallidos[0].encabezados, 'ratelimit-limit'),
        3,
        'RateLimit-Limit del login',
      );

      const bloqueado = await auxiliar.solicitar('/auth/login', {
        metodo: 'POST',
        cuerpo: { email: pasajero.email, contrasena: 'Incorrecta123' },
      });
      afirmarEstado(bloqueado, 429, 'login por encima del límite');
      afirmarCodigo(bloqueado, 'DEMASIADAS_SOLICITUDES', 'rate limit de login');
      afirmar(
        enteroDeEncabezado(bloqueado.encabezados, 'retry-after') > 0,
        'La respuesta 429 de login no incluye Retry-After.',
      );

      evidencia(contexto, 'Login: 3 fallos 401 y el cuarto intento 429 con Retry-After');
    },
  },
  {
    id: 'PM-14',
    titulo: 'Rechazo de prototype pollution sin contaminar Object.prototype',
    async ejecutar(contexto) {
      const propiedadesAntes = Object.getOwnPropertyNames(Object.prototype).sort().join('|');
      afirmar(!('contaminado' in {}), 'Object.prototype ya estaba contaminado antes de la prueba.');

      const pasajero = usuario(contexto, 'pasajero');
      const prefijo = `verif-${contexto.sufijo}-proto`;
      const cuerposRegistro = [
        `{"email":"${prefijo}-1@prog4.test","nombre":"Proto","contrasena":"${contexto.password}","rol":"PASAJERO","__proto__":{"contaminado":true}}`,
        `{"email":"${prefijo}-2@prog4.test","nombre":"Proto","contrasena":"${contexto.password}","rol":"PASAJERO","constructor":{"prototype":{"contaminado":true}}}`,
      ];
      const respuestas = [];

      for (const texto of cuerposRegistro) {
        respuestas.push(await contexto.solicitar('/auth/registro', { metodo: 'POST', texto }));
      }

      respuestas.push(
        await contexto.solicitar('/auth/login', {
          metodo: 'POST',
          texto: `{"email":"${pasajero.email}","contrasena":"Incorrecta123","__proto__":{"contaminado":true}}`,
        }),
      );

      respuestas.push(
        await contexto.solicitar('/viajes', {
          metodo: 'POST',
          token: pasajero.token,
          headers: { 'idempotency-key': claveDePrueba(contexto, 'pm14-proto') },
          texto:
            '{"origen":{"lat":-34.6037,"lng":-58.3816,"__proto__":{"contaminado":true}},' +
            '"destino":{"lat":-34.6083,"lng":-58.3712}}',
        }),
      );

      for (const respuesta of respuestas) {
        afirmarEstado(respuesta, 400, 'payload con claves de prototype pollution');
        afirmarCodigo(respuesta, 'DATOS_INVALIDOS', 'payload con claves no declaradas');
      }

      afirmar(!('contaminado' in {}), 'Object.prototype quedó contaminado.');
      afirmar(!('contaminado' in globalThis), 'globalThis quedó contaminado.');
      afirmar(!Object.hasOwn(Object.prototype, 'contaminado'), 'Object.prototype tiene la clave.');
      afirmarIgual(
        Object.getOwnPropertyNames(Object.prototype).sort().join('|'),
        propiedadesAntes,
        'Object.prototype cambió después de los payloads',
      );

      evidencia(contexto, '4 payloads maliciosos -> 400; Object.prototype intacto');
    },
  },
];
