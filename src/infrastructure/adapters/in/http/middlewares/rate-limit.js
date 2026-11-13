import { rateLimit } from 'express-rate-limit';

import { obtenerRequestId } from '../../../../context/request-context.js';

const MENSAJE_POR_DEFECTO = 'Se superó el límite de solicitudes. Intente más tarde.';

/**
 * Fábrica común de limitadores HTTP.
 *
 * Usa `draft-6` para publicar encabezados informativos separados
 * `RateLimit-Limit`, `RateLimit-Remaining` y `RateLimit-Reset`, además de
 * `Retry-After` cuando responde 429. El límite global y los límites
 * específicos comparten el mismo formato para que el cliente pueda reaccionar
 * sin distinguir el endpoint.
 */
export function crearLimitador({
  windowMs = 60_000,
  limit = 300,
  mensaje = MENSAJE_POR_DEFECTO,
  skipSuccessfulRequests = false,
} = {}) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-6',
    legacyHeaders: false,
    skipSuccessfulRequests,
    handler: (req, res) => {
      res.status(429).json({
        error: {
          codigo: 'DEMASIADAS_SOLICITUDES',
          mensaje,
        },
        requestId: obtenerRequestId() ?? req.id,
      });
    },
  });
}
