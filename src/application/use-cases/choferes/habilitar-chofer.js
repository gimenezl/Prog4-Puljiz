import { ROLES } from '../../../domain/entities/usuario.js';
import { ErrorDeDominio } from '../../../domain/errors/error-de-dominio.js';

/**
 * Caso de uso: habilitar o inhabilitar a un chofer.
 *
 * Solo un administrador puede hacerlo. Al inhabilitar, la entidad fuerza
 * `disponible = false` y conserva el viaje activo si lo hubiera.
 */
export function crearHabilitarChofer({ repositorioChoferes, unidadDeTrabajo }) {
  return async function habilitarChofer({ usuarioId, solicitante, habilitado }) {
    if (solicitante?.rol !== ROLES.ADMINISTRADOR) {
      throw new ErrorDeDominio(
        'NO_AUTORIZADO',
        'Solo un administrador puede habilitar o inhabilitar choferes.',
      );
    }

    return unidadDeTrabajo.ejecutar(async (tx) => {
      const chofer = await repositorioChoferes.buscarPorUsuarioIdParaActualizar(usuarioId, tx);

      if (!chofer) {
        throw new ErrorDeDominio('NO_ENCONTRADO', 'El perfil de chofer no existe.');
      }

      const actualizado = chofer.conHabilitacion(habilitado);
      await repositorioChoferes.actualizar(actualizado, tx);

      return actualizado;
    });
  };
}
