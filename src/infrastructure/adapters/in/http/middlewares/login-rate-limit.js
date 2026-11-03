import { rateLimit } from 'express-rate-limit';

import { obtenerRequestId } from '../../../../context/request-context.js';

/**
 * Limitador específico para intentos de login. Solo cuenta las respuestas
 * fallidas y se reinicia al terminar la ventana.
 */
export function crearLimitadorLogin({ windowMs = 15 * 60_000, limit = 5 } = {}) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    handler: (req, res) => {
      res.status(429).json({
        error: {
          codigo: 'DEMASIADAS_SOLICITUDES',
          mensaje: 'Demasiados intentos de inicio de sesión. Intentá más tarde.',
        },
        requestId: obtenerRequestId() ?? req.id,
      });
    },
  });
}
