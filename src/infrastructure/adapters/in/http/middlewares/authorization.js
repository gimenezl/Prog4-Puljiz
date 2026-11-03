import { ErrorDeDominio } from '../../../../../domain/errors/error-de-dominio.js';

/**
 * Middleware de autorización por rol. Se monta siempre después de la
 * autenticación. La autorización por recurso sigue viviendo en los casos de uso.
 */
export function crearAutorizacionPorRol(...rolesPermitidos) {
  return function autorizacionPorRol(req, _res, next) {
    if (!req.autenticacion || !rolesPermitidos.includes(req.autenticacion.rol)) {
      return next(
        new ErrorDeDominio('NO_AUTORIZADO', 'No tenés permiso para realizar esta operación.'),
      );
    }

    return next();
  };
}
