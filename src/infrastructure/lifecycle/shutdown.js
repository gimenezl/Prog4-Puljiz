import { closeHttpServer } from './http-server.js';

const TIEMPO_LIMITE_POR_DEFECTO_MS = 10_000;

/**
 * Crea un cierre idempotente para el servidor HTTP y los recursos externos.
 * Si el cierre tarda más de timeoutMs, fuerza la salida con código 1 para
 * no dejar el proceso colgado.
 */
export function createShutdownHandler({
  servidor,
  cerrarRecursos = async () => {},
  logger,
  timeoutMs = TIEMPO_LIMITE_POR_DEFECTO_MS,
}) {
  let cierreEnCurso;

  return function shutdown(senal = 'SIGTERM') {
    if (cierreEnCurso) return cierreEnCurso;

    cierreEnCurso = (async () => {
      logger?.info({ senal }, 'Cierre ordenado iniciado');

      const temporizador = setTimeout(() => {
        logger?.fatal({ senal, timeoutMs }, 'Cierre forzado: tiempo agotado');
        process.exit(1);
      }, timeoutMs);
      temporizador.unref();

      const errores = [];

      try {
        await closeHttpServer(servidor);
      } catch (error) {
        errores.push(error);
      }

      try {
        await cerrarRecursos();
      } catch (error) {
        errores.push(error);
      }

      clearTimeout(temporizador);

      if (errores.length > 0) {
        for (const error of errores) {
          logger?.error({ err: error, senal }, 'Error durante el cierre ordenado');
        }
        process.exitCode = 1;
        return;
      }

      logger?.info({ senal }, 'Cierre ordenado completado');
    })();

    return cierreEnCurso;
  };
}
