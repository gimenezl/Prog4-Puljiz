import { UbicacionChofer } from '../../../domain/entities/ubicacion-chofer.js';
import { ROLES } from '../../../domain/entities/usuario.js';
import { ErrorDeDominio } from '../../../domain/errors/error-de-dominio.js';

/**
 * Caso de uso: el chofer informa su posición actual (RF-03).
 *
 * Solo un chofer habilitado envía ubicación: disponible, para recibir viajes,
 * u ocupado, para el seguimiento del viaje en curso. La hora de la ubicación
 * es siempre la del servidor (puerto Reloj), nunca la del cliente.
 */
export function crearActualizarUbicacionChofer({
  repositorioChoferes,
  repositorioUbicaciones,
  reloj,
}) {
  return async function actualizarUbicacionChofer({ choferId, solicitante, punto }) {
    if (solicitante?.rol !== ROLES.CHOFER || solicitante.usuarioId !== choferId) {
      throw new ErrorDeDominio(
        'NO_AUTORIZADO',
        'Solo el propio chofer puede informar su ubicación.',
      );
    }

    // Primero se validan los datos recibidos (coordenadas en rango) y después
    // el estado del chofer: una entrada inválida es 400 en cualquier estado.
    const ubicacion = new UbicacionChofer({ choferId, punto, actualizadaEn: reloj.ahora() });
    const chofer = await repositorioChoferes.buscarPorUsuarioId(choferId);

    if (!chofer) {
      throw new ErrorDeDominio('NO_ENCONTRADO', 'El perfil de chofer no existe.');
    }

    if (!chofer.habilitado) {
      throw new ErrorDeDominio(
        'CHOFER_NO_ELEGIBLE',
        'Un chofer inhabilitado no puede informar su ubicación.',
      );
    }

    await repositorioUbicaciones.guardar(ubicacion);

    return ubicacion;
  };
}
