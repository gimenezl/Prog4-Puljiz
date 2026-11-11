import { ROLES } from '../../../domain/entities/usuario.js';
import { ErrorDeDominio } from '../../../domain/errors/error-de-dominio.js';

/**
 * Caso de uso: que un chofer declare si está disponible.
 *
 * Bloquea el perfil dentro de una unidad de trabajo para no pisar una
 * asignación concurrente de viaje. El `viajeActivoId` se conserva.
 */
export function crearActualizarDisponibilidadChofer({ repositorioChoferes, unidadDeTrabajo }) {
  return async function actualizarDisponibilidadChofer({ usuarioId, solicitante, disponible }) {
    if (solicitante?.rol !== ROLES.CHOFER || solicitante.usuarioId !== usuarioId) {
      throw new ErrorDeDominio(
        'NO_AUTORIZADO',
        'Solo el propio chofer puede cambiar su disponibilidad.',
      );
    }

    return unidadDeTrabajo.ejecutar(async (tx) => {
      const chofer = await repositorioChoferes.buscarPorUsuarioIdParaActualizar(usuarioId, tx);

      if (!chofer) {
        throw new ErrorDeDominio('NO_ENCONTRADO', 'El perfil de chofer no existe.');
      }

      const actualizado = chofer.conDisponibilidad(disponible);
      await repositorioChoferes.actualizar(actualizado, tx);

      return actualizado;
    });
  };
}
