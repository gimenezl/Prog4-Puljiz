import pino from 'pino';

import { obtenerRequestId } from '../context/request-context.js';

/**
 * Logger estructurado en JSON. El mixin agrega el requestId del contexto
 * actual a todos los logs emitidos durante una request.
 */
export function createLogger({ LOG_LEVEL, NODE_ENV }) {
  return pino({
    level: LOG_LEVEL,
    base: { servicio: 'prog4-puljiz', entorno: NODE_ENV },
    timestamp: pino.stdTimeFunctions.isoTime,
    mixin() {
      const requestId = obtenerRequestId();
      return requestId ? { requestId } : {};
    },
    redact: {
      paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
      censor: '[REDACTADO]',
    },
  });
}
