import { composeApplication } from './composition-root.js';
import { loadEnv } from './infrastructure/config/env.js';

const entorno = loadEnv();
const { app, logger, shutdown } = composeApplication(entorno);

const servidor = app.listen(entorno.PORT, entorno.HOST, () => {
  logger.info(
    { puerto: entorno.PORT, host: entorno.HOST, adaptadores: entorno.ADAPTERS_MODE },
    'Servidor HTTP iniciado',
  );
});

let cerrando = false;

async function cerrar(senal) {
  if (cerrando) return;
  cerrando = true;

  logger.info({ senal }, 'Cierre ordenado iniciado');

  const cierreForzado = setTimeout(() => {
    logger.error('No se pudo cerrar el servidor a tiempo');
    process.exit(1);
  }, 10_000);
  cierreForzado.unref();

  servidor.close(async (errorHttp) => {
    try {
      await shutdown();
    } catch (errorCierre) {
      logger.error({ err: errorCierre }, 'Error al cerrar los adaptadores');
      process.exitCode = 1;
    }

    clearTimeout(cierreForzado);

    if (errorHttp) {
      logger.error({ err: errorHttp }, 'Error al cerrar el servidor HTTP');
      process.exitCode = 1;
    }

    process.exit();
  });
}

for (const senal of ['SIGINT', 'SIGTERM']) {
  process.on(senal, () => {
    void cerrar(senal);
  });
}

process.on('unhandledRejection', (motivo) => {
  logger.fatal({ err: motivo }, 'Promesa rechazada sin control');
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'Excepción no controlada');
  process.exit(1);
});
