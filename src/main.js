import pino from 'pino';

import { composeApplication } from './composition-root.js';
import { loadEnv } from './infrastructure/config/env.js';
import { startHttpServer } from './infrastructure/lifecycle/http-server.js';
import { createShutdownHandler } from './infrastructure/lifecycle/shutdown.js';

const loggerArranque = pino({ base: { servicio: 'prog4-puljiz' } });

async function iniciar() {
  let composicion;

  try {
    const entorno = loadEnv();
    composicion = composeApplication(entorno);

    const servidor = await startHttpServer({
      app: composicion.app,
      host: entorno.HOST,
      port: entorno.PORT,
      logger: composicion.logger,
    });

    const shutdown = createShutdownHandler({
      servidor,
      cerrarRecursos: composicion.shutdown,
      logger: composicion.logger,
      timeoutMs: entorno.SHUTDOWN_TIMEOUT_MS,
    });

    for (const senal of ['SIGTERM', 'SIGINT']) {
      process.on(senal, () => {
        void shutdown(senal);
      });
    }

    process.on('unhandledRejection', (motivo) => {
      composicion.logger.fatal({ err: motivo }, 'Promesa rechazada sin control');
      process.exitCode = 1;
      void shutdown('unhandledRejection');
    });

    process.on('uncaughtException', (error) => {
      composicion.logger.fatal({ err: error }, 'Excepción no controlada');
      process.exitCode = 1;
      void shutdown('uncaughtException');
    });
  } catch (error) {
    const logger = composicion?.logger ?? loggerArranque;
    logger.fatal({ err: error }, 'No se pudo iniciar la aplicación');

    if (composicion) {
      try {
        await composicion.shutdown();
      } catch (errorCierre) {
        logger.error({ err: errorCierre }, 'Error al liberar recursos tras un fallo de arranque');
      }
    }

    process.exit(1);
  }
}

void iniciar();
