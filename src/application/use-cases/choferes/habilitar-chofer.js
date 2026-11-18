import { ROLES } from '../../../domain/entities/usuario.js';
import { ErrorDeDominio } from '../../../domain/errors/error-de-dominio.js';

/**
 * Caso de uso: habilitar o inhabilitar a un chofer.
 *
 * Solo un administrador puede hacerlo. Para habilitar, el chofer tiene que
 * tener un vehículo registrado (docs/modelo.md, Q11); inhabilitar se permite
 * siempre. Al inhabilitar, la entidad fuerza `disponible = false` y conserva el
 * viaje activo si lo hubiera.
 */
export function crearHabilitarChofer({
  repositorioChoferes,
  repositorioVehiculos,
  unidadDeTrabajo,
}) {
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

      if (habilitado && !(await repositorioVehiculos.buscarPorChoferId(usuarioId, tx))) {
        throw new ErrorDeDominio(
          'CHOFER_SIN_VEHICULO',
          'El chofer debe registrar un vehículo antes de ser habilitado.',
        );
      }

      const actualizado = chofer.conHabilitacion(habilitado);
      await repositorioChoferes.actualizar(actualizado, tx);

      return actualizado;
    });
  };
}
