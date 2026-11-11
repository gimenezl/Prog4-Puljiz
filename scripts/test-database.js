import { spawn } from 'node:child_process';
import path from 'node:path';
import { setTimeout as esperar } from 'node:timers/promises';

import pg from 'pg';

import { aplicarMigraciones } from './migrate.js';
import { PostgresDatabase } from '../src/infrastructure/adapters/out/persistence/postgres-database.js';

const { Client } = pg;

const RAIZ = path.resolve(import.meta.dirname, '..');
const ARCHIVO_COMPOSE = path.join(RAIZ, 'compose.test.yaml');
const SERVICIO = 'db-test';
const PUERTO = Number(process.env.POSTGRES_TEST_PORT ?? 5433);
const URL_COMPOSE = `postgresql://admin:password@127.0.0.1:${PUERTO}/proy_db_test`;
const URL_PRUEBAS = process.env.TEST_DATABASE_URL ?? URL_COMPOSE;
const USA_COMPOSE = URL_PRUEBAS === URL_COMPOSE;
const ESPERA_MAXIMA_MS = Number(process.env.TEST_DATABASE_TIMEOUT_MS ?? 30000);
const SECRETO_DE_PRUEBAS = 'secreto-de-integracion-de-al-menos-32-caracteres';

function informar(mensaje) {
  process.stderr.write(`[test-db] ${mensaje}\n`);
}

function ejecutar(comando, argumentos, { env = process.env, stdio = 'inherit' } = {}) {
  return new Promise((resolver, rechazar) => {
    const proceso = spawn(comando, argumentos, { cwd: RAIZ, env, stdio });

    proceso.once('error', rechazar);
    proceso.once('exit', (codigo, senal) => resolver({ codigo: codigo ?? 1, senal }));
  });
}

async function dockerCompose(...argumentos) {
  const resultado = await ejecutar('docker', ['compose', '-f', ARCHIVO_COMPOSE, ...argumentos]);

  if (resultado.codigo !== 0) {
    throw new Error(`docker compose ${argumentos.join(' ')} falló con código ${resultado.codigo}.`);
  }
}

async function esperarBaseDeDatos(url) {
  const limite = Date.now() + ESPERA_MAXIMA_MS;
  let ultimoError;

  while (Date.now() < limite) {
    const cliente = new Client({
      connectionString: url,
      connectionTimeoutMillis: 1000,
    });

    try {
      await cliente.connect();
      await cliente.query('SELECT 1');
      return;
    } catch (error) {
      ultimoError = error;
    } finally {
      await cliente.end().catch(() => {});
    }

    await esperar(250);
  }

  throw new Error(
    `La base de pruebas no respondió en ${ESPERA_MAXIMA_MS} ms: ${
      ultimoError?.message ?? 'sin detalle'
    }`,
  );
}

async function reiniciarEsquema(url) {
  const baseDeDatos = new PostgresDatabase({
    connectionString: url,
    max: 1,
    connectionTimeoutMs: 5000,
    statementTimeoutMs: 15000,
  });

  try {
    await baseDeDatos.query('DROP SCHEMA IF EXISTS public CASCADE');
    await baseDeDatos.query('CREATE SCHEMA public');
    await aplicarMigraciones(baseDeDatos);
  } finally {
    await baseDeDatos.cerrar();
  }
}

async function bajarContenedor() {
  await dockerCompose('down', '--volumes', '--remove-orphans');
}

async function correrTests() {
  const resultado = await ejecutar(
    process.execPath,
    ['--test', '--test-concurrency=1', 'tests/integration/postgres/'],
    {
      env: {
        ...process.env,
        NODE_ENV: 'test',
        LOG_LEVEL: 'silent',
        ADAPTERS_MODE: 'real',
        TEST_DATABASE_URL: URL_PRUEBAS,
        DATABASE_URL: URL_PRUEBAS,
        JWT_SECRET: SECRETO_DE_PRUEBAS,
        PASSWORD_HASH_COST: '4',
      },
    },
  );

  return resultado.codigo;
}

async function levantar(url = URL_PRUEBAS) {
  informar(`levantando ${SERVICIO} con ${ARCHIVO_COMPOSE}`);
  await dockerCompose('up', '-d', SERVICIO);
  informar(`esperando ${url}`);
  await esperarBaseDeDatos(url);
}

async function comandoUp() {
  try {
    await levantar(URL_COMPOSE);
    await reiniciarEsquema(URL_COMPOSE);
    informar(`base de pruebas lista en ${URL_COMPOSE}`);
  } catch (error) {
    await bajarContenedor().catch(() => {});
    throw error;
  }
}

async function comandoRun() {
  let contenedorLevantado = false;

  try {
    if (USA_COMPOSE) {
      contenedorLevantado = true;
      await levantar();
      await reiniciarEsquema(URL_PRUEBAS);
      informar('esquema recreado y migraciones aplicadas');
    } else {
      informar(`usando base externa ${URL_PRUEBAS}; no se reinicia el esquema`);
      await esperarBaseDeDatos(URL_PRUEBAS);
    }

    const codigo = await correrTests();
    if (codigo !== 0) process.exitCode = codigo;
  } finally {
    if (contenedorLevantado && process.env.KEEP_TEST_DB === '1') {
      informar('KEEP_TEST_DB=1: contenedor de pruebas conservado');
    } else if (contenedorLevantado) {
      try {
        await bajarContenedor();
      } catch (error) {
        informar(`no se pudo bajar el contenedor: ${error.message}`);
        process.exitCode = process.exitCode || 1;
      }
    }
  }
}

async function principal() {
  const comando = process.argv[2] ?? 'run';

  switch (comando) {
    case 'up':
      await comandoUp();
      break;
    case 'down':
      await bajarContenedor();
      break;
    case 'run':
      await comandoRun();
      break;
    default:
      throw new Error(`Comando desconocido: ${comando}. Use up, down o run.`);
  }
}

principal().catch((error) => {
  process.stderr.write(`[test-db] ${error.message}\n`);
  process.exitCode = 1;
});
