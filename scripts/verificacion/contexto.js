/**
 * Ciclo de vida del verificador: entorno aislado, siembra de usuarios,
 * servidor HTTP en puerto efímero y limpieza de los datos creados.
 *
 * En modo PostgreSQL se usan los adaptadores reales y las migraciones. En modo
 * fake todo vive en memoria y cada ejecución arranca de cero.
 */

import { randomUUID } from 'node:crypto';

import { composeApplication } from '../../src/composition-root.js';
import { Chofer } from '../../src/domain/entities/chofer.js';
import { ROLES, Usuario } from '../../src/domain/entities/usuario.js';
import { loadEnv } from '../../src/infrastructure/config/env.js';
import {
  closeHttpServer,
  startHttpServer,
} from '../../src/infrastructure/lifecycle/http-server.js';
import { aplicarMigraciones } from '../migrate.js';
import { solicitar } from './utilidades.js';

const SECRETO_DE_PRUEBA = 'secreto-de-verificacion-local-de-32-o-mas-caracteres';
const URL_POSTGRES_POR_DEFECTO = 'postgresql://admin:password@127.0.0.1:5433/proy_db_test';
const PASSWORD_DE_PRUEBA = 'Verificar1234!';

export const USUARIOS_PRINCIPALES = Object.freeze([
  { clave: 'admin', nombre: 'Admin Verificación', rol: ROLES.ADMINISTRADOR },
  { clave: 'soporte', nombre: 'Soporte Verificación', rol: ROLES.OPERADOR_SOPORTE },
  { clave: 'pasajero', nombre: 'Pasajero Verificación', rol: ROLES.PASAJERO },
  { clave: 'pasajero2', nombre: 'Pasajero Ajeno', rol: ROLES.PASAJERO },
  { clave: 'chofer1', nombre: 'Chofer Verificación', rol: ROLES.CHOFER },
  { clave: 'chofer2', nombre: 'Chofer Alternativo', rol: ROLES.CHOFER },
]);

export function urlPostgres() {
  return process.env.TEST_DATABASE_URL ?? URL_POSTGRES_POR_DEFECTO;
}

export function describirBaseDeDatos(url) {
  try {
    const parseada = new URL(url);
    return `${parseada.hostname}:${parseada.port || '5432'}${parseada.pathname}`;
  } catch {
    return '(URL inválida)';
  }
}

function construirEntorno({ postgres, limites }) {
  const fuente = {
    NODE_ENV: 'test',
    HOST: '127.0.0.1',
    PORT: '3000',
    LOG_LEVEL: 'silent',
    ADAPTERS_MODE: postgres ? 'real' : 'fake',
    JWT_SECRET: SECRETO_DE_PRUEBA,
    PASSWORD_HASH_COST: '4',
    ...limites,
  };

  if (postgres) {
    fuente.DATABASE_URL = urlPostgres();
  }

  return loadEnv(fuente);
}

/**
 * Levanta una aplicación completa en un puerto libre. No usa `src/main.js`
 * para no depender de variables del `.env` ni de un puerto fijo.
 */
export async function crearContexto({
  postgres = false,
  etiqueta = 'principal',
  sufijo = randomUUID().slice(0, 12),
  limites = {},
} = {}) {
  const entorno = construirEntorno({ postgres, limites });
  const dependencias = composeApplication(entorno);

  try {
    if (postgres) {
      await aplicarMigraciones(dependencias.baseDeDatos, {
        logger: dependencias.logger,
      });
    }

    const servidor = await startHttpServer({
      app: dependencias.app,
      host: '127.0.0.1',
      port: 0,
      logger: dependencias.logger,
    });

    const baseUrl = `http://127.0.0.1:${servidor.address().port}`;

    return {
      etiqueta,
      postgres,
      sufijo,
      password: PASSWORD_DE_PRUEBA,
      baseUrl,
      dependencias,
      servidor,
      usuarios: {},
      evidencia: [],
      solicitar: (ruta, opciones) => solicitar(baseUrl, ruta, opciones),
    };
  } catch (error) {
    await dependencias.shutdown().catch(() => {});
    throw error;
  }
}

function emailDe(contexto, clave) {
  return `verif-${contexto.sufijo}-${clave}@prog4.test`;
}

/**
 * Crea usuarios directamente en los repositorios para que los casos HTTP no
 * dependan de un seed externo. Los emails llevan el sufijo de la ejecución y
 * la limpieza en PostgreSQL se apoya en ese prefijo.
 */
export async function sembrarUsuarios(contexto, definiciones) {
  const { dependencias } = contexto;
  const ahora = dependencias.reloj.ahora();

  for (const definicion of definiciones) {
    const email = emailDe(contexto, definicion.clave);
    const credencial = await dependencias.hasherContrasenas.hashear(contexto.password);
    const usuario = new Usuario({
      id: randomUUID(),
      email,
      nombre: definicion.nombre,
      credencial,
      rol: definicion.rol,
      creadoEn: ahora,
    });

    await dependencias.repositorioUsuarios.crear(usuario);

    if (definicion.rol === ROLES.CHOFER) {
      await dependencias.repositorioChoferes.crear(
        new Chofer({
          usuarioId: usuario.id,
          habilitado: true,
          disponible: true,
        }),
      );
    }

    const { token } = await dependencias.servicioDeTokens.firmar({
      usuarioId: usuario.id,
      rol: usuario.rol,
    });

    contexto.usuarios[definicion.clave] = {
      id: usuario.id,
      email,
      rol: usuario.rol,
      usuario,
      token,
    };
  }
}

export function usuario(contexto, clave) {
  const encontrado = contexto.usuarios[clave];

  if (!encontrado) {
    throw new Error(`El usuario de prueba "${clave}" no fue sembrado.`);
  }

  return encontrado;
}

async function limpiarPostgres(contexto) {
  const { baseDeDatos } = contexto.dependencias;
  const patronEmail = `verif-${contexto.sufijo}-%@prog4.test`;
  const patronClave = `verif-${contexto.sufijo}-%`;

  const { rows } = await baseDeDatos.query('SELECT id FROM usuarios WHERE email LIKE $1', [
    patronEmail,
  ]);
  const ids = rows.map((fila) => fila.id);

  if (ids.length > 0) {
    await baseDeDatos.query(
      `DELETE FROM cobros_simulados
        WHERE viaje_id IN (
          SELECT id FROM viajes
           WHERE pasajero_id = ANY($1::uuid[]) OR chofer_id = ANY($1::uuid[])
        )`,
      [ids],
    );
    await baseDeDatos.query(
      `DELETE FROM viajes
        WHERE pasajero_id = ANY($1::uuid[]) OR chofer_id = ANY($1::uuid[])`,
      [ids],
    );
    await baseDeDatos.query('DELETE FROM choferes WHERE usuario_id = ANY($1::uuid[])', [ids]);
    await baseDeDatos.query('DELETE FROM usuarios WHERE id = ANY($1::uuid[])', [ids]);
  }

  await baseDeDatos.query('DELETE FROM claves_idempotencia WHERE clave LIKE $1', [patronClave]);

  return ids.length;
}

/**
 * Cierra el servidor, elimina los datos creados y libera la pool.
 * Devuelve una lista de advertencias para que un fallo de limpieza no oculte
 * el resultado de las verificaciones.
 */
export async function cerrarContexto(contexto, { conservarDatos = false } = {}) {
  if (!contexto) return [];

  const advertencias = [];

  try {
    await closeHttpServer(contexto.servidor);
  } catch (error) {
    advertencias.push(`No se pudo cerrar el servidor: ${error.message}`);
  }

  if (contexto.postgres && !conservarDatos) {
    try {
      const eliminados = await limpiarPostgres(contexto);
      contexto.datosEliminados = eliminados;
    } catch (error) {
      advertencias.push(`No se pudieron limpiar los datos de PostgreSQL: ${error.message}`);
    }
  }

  try {
    await contexto.dependencias.shutdown();
  } catch (error) {
    advertencias.push(`No se pudo liberar la base de datos: ${error.message}`);
  }

  return advertencias;
}
