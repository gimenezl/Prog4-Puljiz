import { obtenerRequestId } from '../../../../context/request-context.js';

/**
 * Respuesta uniforme para recursos inexistentes.
 */
export function notFoundHandler(req, res) {
  res.status(404).json({
    error: {
      codigo: 'RECURSO_NO_ENCONTRADO',
      mensaje: 'El recurso solicitado no existe.',
    },
    requestId: obtenerRequestId() ?? req.id,
  });
}
