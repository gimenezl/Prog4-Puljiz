/**
 * Manejador central de errores. Nunca expone el stack trace al cliente.
 */
export function createErrorHandler({ logger }) {
  return (error, req, res, next) => {
    if (res.headersSent) {
      return next(error);
    }

    const estado =
      Number.isInteger(error?.status) && error.status >= 400 && error.status < 600
        ? error.status
        : 500;

    if (estado >= 500) {
      logger.error({ err: error, requestId: req.id }, 'Error no controlado');
    } else {
      logger.warn({ err: error, requestId: req.id }, 'Solicitud rechazada');
    }

    res.status(estado).json({
      error: {
        codigo: estado >= 500 ? 'ERROR_INTERNO' : (error?.codigo ?? 'SOLICITUD_INVALIDA'),
        mensaje:
          estado >= 500
            ? 'Ocurrió un error inesperado.'
            : (error?.message ?? 'La solicitud no pudo procesarse.'),
      },
      requestId: req.id,
    });
  };
}
