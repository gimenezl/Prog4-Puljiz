import { createHttpApp } from './infrastructure/adapters/in/http/app.js';
import { FixedClock } from './infrastructure/adapters/out/clock/fixed-clock.js';
import { SystemClock } from './infrastructure/adapters/out/clock/system-clock.js';
import { InMemoryDatabase } from './infrastructure/adapters/out/persistence/in-memory-database.js';
import { PostgresDatabase } from './infrastructure/adapters/out/persistence/postgres-database.js';
import { createLogger } from './infrastructure/logging/logger.js';

/**
 * Único punto de composición de la aplicación.
 *
 * Aquí se crean los adaptadores y se inyectan en los puertos. Cambiar de
 * implementación real a falsa se hace únicamente con ADAPTERS_MODE o
 * modificando este archivo.
 */
export function composeApplication(entorno) {
  const logger = createLogger(entorno);
  const usaAdaptadoresFalsos = entorno.ADAPTERS_MODE === 'fake';

  const baseDeDatos = usaAdaptadoresFalsos
    ? new InMemoryDatabase()
    : new PostgresDatabase({
        connectionString: entorno.DATABASE_URL,
        ssl: entorno.DATABASE_SSL,
        max: entorno.DATABASE_POOL_MAX,
        connectionTimeoutMs: entorno.DATABASE_CONNECTION_TIMEOUT_MS,
        statementTimeoutMs: entorno.DATABASE_STATEMENT_TIMEOUT_MS,
        logger,
      });

  const reloj = usaAdaptadoresFalsos ? new FixedClock() : new SystemClock();

  const healthCheck = async () => {
    const [resultadoBaseDeDatos] = await Promise.allSettled([baseDeDatos.ping()]);

    return {
      baseDeDatos: {
        ok: resultadoBaseDeDatos.status === 'fulfilled' && resultadoBaseDeDatos.value === true,
      },
      reloj: { ok: reloj.ahora() instanceof Date },
    };
  };

  const app = createHttpApp({
    logger,
    healthCheck,
    corsOrigin: entorno.CORS_ORIGIN,
    bodyLimit: entorno.BODY_LIMIT,
    rateLimit: {
      windowMs: entorno.RATE_LIMIT_WINDOW_MS,
      limit: entorno.RATE_LIMIT_MAX,
    },
  });

  async function shutdown() {
    await baseDeDatos.close();
  }

  return { app, logger, baseDeDatos, reloj, shutdown };
}
