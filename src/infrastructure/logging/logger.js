import pino from 'pino';

/**
 * Logger estructurado. No se registran credenciales ni cabeceras sensibles.
 */
export function createLogger({ LOG_LEVEL, NODE_ENV }) {
  return pino({
    level: LOG_LEVEL,
    base: { servicio: 'prog4-puljiz', entorno: NODE_ENV },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
      censor: '[REDACTADO]',
    },
  });
}
