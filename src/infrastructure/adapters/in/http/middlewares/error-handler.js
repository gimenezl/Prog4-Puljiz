import { ErrorDeDominio } from '../../../../../domain/errors/error-de-dominio.js';
import { obtenerLogger, obtenerRequestId } from '../../../../context/request-context.js';
import { serializarErrorParaLog } from '../../../../logging/error-serializer.js';
import { mapearErrorDeDominio, mapearErrorHttp } from '../error-mapping.js';

/**
 * Manejador global de errores. Es el único lugar que traduce errores a
 * respuestas HTTP. Nunca devuelve stack trace ni detalles internos.
 */
export function createErrorHandler({ logger }) {
  return (error, req, res, next) => {
    if (res.headersSent) {
      return next(error);
    }

    const requestId = obtenerRequestId() ?? req.id;
    const loggerSolicitud = obtenerLogger() ?? logger;

    const esErrorDeDominio = error instanceof ErrorDeDominio;
    const mapeo = esErrorDeDominio ? mapearErrorDeDominio(error) : mapearErrorHttp(error);

    const estado =
      mapeo?.estado ??
      (Number.isInteger(error?.status) && error.status >= 400 && error.status < 600
        ? error.status
        : 500);

    const codigo =
      mapeo?.codigo ?? (estado >= 500 ? 'ERROR_INTERNO' : (error?.codigo ?? 'SOLICITUD_INVALIDA'));

    const mensaje =
      mapeo?.mensaje ??
      (estado >= 500 ? 'Ocurrió un error inesperado.' : 'La solicitud no pudo procesarse.');

    const errorParaLog = serializarErrorParaLog(error);

    if (estado >= 500) {
      loggerSolicitud.error({ err: errorParaLog, requestId }, 'Error no controlado');
    } else {
      loggerSolicitud.warn({ err: errorParaLog, requestId, codigo }, 'Solicitud rechazada');
    }

    res.status(estado).json({
      error: { codigo, mensaje },
      requestId,
    });
  };
}
