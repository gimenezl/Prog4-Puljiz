import { crearLimitador } from './rate-limit.js';

const MENSAJE_LOGIN = 'Demasiados intentos de inicio de sesión. Intentá más tarde.';

/**
 * Limitador específico para intentos de login. Solo cuenta las respuestas
 * fallidas y se reinicia al terminar la ventana. Publica los mismos
 * encabezados informativos que el resto de los limitadores.
 */
export function crearLimitadorLogin({ windowMs = 15 * 60_000, limit = 5 } = {}) {
  return crearLimitador({
    windowMs,
    limit,
    mensaje: MENSAJE_LOGIN,
    skipSuccessfulRequests: true,
  });
}
