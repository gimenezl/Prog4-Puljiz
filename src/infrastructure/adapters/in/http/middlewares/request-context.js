import { normalizarRequestId } from '../../../../context/request-id.js';
import { ejecutarConContexto } from '../../../../context/request-context.js';

/**
 * Toma el req.id generado por pino-http, lo publica en el header de respuesta
 * y abre un contexto de AsyncLocalStorage para el resto de la cadena.
 */
export function createRequestContextMiddleware({ logger }) {
  return (req, res, next) => {
    const requestId = normalizarRequestId(req.id ?? req.headers['x-request-id']);
    const loggerSolicitud = req.log ?? logger?.child({ requestId });

    req.id = requestId;
    res.setHeader('x-request-id', requestId);

    ejecutarConContexto({ requestId, logger: loggerSolicitud }, next);
  };
}
