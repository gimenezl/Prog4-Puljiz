import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { loadEnv } from '../src/infrastructure/config/env.js';
import { PostgresDatabase } from '../src/infrastructure/adapters/out/persistence/postgres-database.js';
import { createLogger } from '../src/infrastructure/logging/logger.js';

export const DIRECTORIO_MIGRACIONES = path.resolve(import.meta.dirname, '../db/migrations');

/**
 * Aplica en orden alfabético todas las migraciones SQL sobre la base indicada.
 * Las migraciones actuales son idempotentes (`IF NOT EXISTS`), por lo que se
 * pueden volver a ejecutar sin romper una base existente.
 *
 * La función se exporta para que los tests de integración puedan preparar una
 * base de pruebas sin depender del proceso CLI.
 */
export async function aplicarMigraciones(
  baseDeDatos,
  { logger, directorio = DIRECTORIO_MIGRACIONES } = {},
) {
  const archivos = (await readdir(directorio)).filter((archivo) => archivo.endsWith('.sql')).sort();

  for (const archivo of archivos) {
    const sql = await readFile(path.join(directorio, archivo), 'utf8');
    await baseDeDatos.query(sql);
    logger?.info({ migracion: archivo }, 'Migración aplicada');
  }
}

async function migrar() {
  const entorno = loadEnv();

  if (entorno.ADAPTERS_MODE !== 'real') {
    throw new Error('Las migraciones requieren ADAPTERS_MODE=real y DATABASE_URL.');
  }

  const logger = createLogger(entorno);
  const baseDeDatos = new PostgresDatabase({
    connectionString: entorno.DATABASE_URL,
    ssl: entorno.DATABASE_SSL,
    max: entorno.DATABASE_POOL_MAX,
    connectionTimeoutMs: entorno.DATABASE_CONNECTION_TIMEOUT_MS,
    statementTimeoutMs: entorno.DATABASE_STATEMENT_TIMEOUT_MS,
    logger,
  });

  try {
    await aplicarMigraciones(baseDeDatos, { logger });
  } finally {
    await baseDeDatos.cerrar();
  }
}

const ejecucionDirecta =
  typeof process.argv[1] === 'string' &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (ejecucionDirecta) {
  migrar().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
