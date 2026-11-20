import { ROLES } from '../../domain/entities/usuario.js';
import { ErrorDeDominio } from '../../domain/errors/error-de-dominio.js';

/** La autorización también se comprueba en el caso de uso, no solo en HTTP. */
export function validarAdministrador(actor) {
  if (actor?.rol !== ROLES.ADMINISTRADOR) {
    throw new ErrorDeDominio(
      'NO_AUTORIZADO',
      'Solo un administrador puede configurar la tarifa, las zonas y las reglas.',
    );
  }
}
