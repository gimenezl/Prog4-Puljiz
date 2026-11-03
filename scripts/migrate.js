import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { loadEnv } from '../src/infrastructure/config/env.js';
import { PostgresDatabase } from '../src/infrastructure/adapters/out/persistence/postgres-database.js';
import { createLogger } from '../src/infrastructure/logging/logger.js';

const DIRECTORIO_MIGRACIONES = path.resolve(import.meta.dirname, '../db/migrations');

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
    const archivos = (await readdir(DIRECTORIO_MIGRACIONES))
      .filter((archivo) => archivo.endsWith('.sql'))
      .sort();

    for (const archivo of archivos) {
      const sql = await readFile(path.join(DIRECTORIO_MIGRACIONES, archivo), 'utf8');
      await baseDeDatos.query(sql);
      logger.info({ migracion: archivo }, 'Migración aplicada');
    }
  } finally {
    await baseDeDatos.cerrar();
  }
}

migrar().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
