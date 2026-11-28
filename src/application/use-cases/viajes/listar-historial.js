import { ROLES } from '../../../domain/entities/usuario.js';
import { ErrorDeDominio } from '../../../domain/errors/error-de-dominio.js';
import { paginarPorCursor } from '../../services/cursor.js';

/**
 * Caso de uso: historial de viajes propio (RF-14).
 *
 * Devuelve solo los viajes donde el solicitante participa: como pasajero o
 * como chofer asignado. Nunca viajes ajenos. Del más nuevo al más viejo, con
 * paginación por cursor.
 */
export function crearListarHistorial({ repositorioViajes }) {
  return async function listarHistorial({ solicitante, estado = null, cursor = null, limite }) {
    if (solicitante?.rol !== ROLES.PASAJERO && solicitante?.rol !== ROLES.CHOFER) {
      throw new ErrorDeDominio('NO_AUTORIZADO', 'El historial es solo para pasajeros y choferes.');
    }

    return paginarPorCursor({
      cursor,
      limite,
      listar: ({ antesDe, limite: cantidad }) =>
        repositorioViajes.listarPorParticipante(solicitante.usuarioId, {
          estados: estado ? [estado] : null,
          antesDe,
          limite: cantidad,
        }),
    });
  };
}
