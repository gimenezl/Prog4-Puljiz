import { ROLES } from '../../../domain/entities/usuario.js';
import { ErrorDeDominio } from '../../../domain/errors/error-de-dominio.js';
import { paginarPorCursor } from '../../services/cursor.js';

/**
 * Caso de uso: viajes activos de todo el sistema (RF-15).
 *
 * Para el operador de soporte, que atiende reclamos y puede cancelarlos, y
 * para el administrador, que solo los mira. Incluye SOLICITADO, ASIGNADO,
 * CHOFER_EN_CAMINO y EN_CURSO, del más nuevo al más viejo.
 */
export function crearListarViajesActivos({ repositorioViajes }) {
  return async function listarViajesActivos({ solicitante, cursor = null, limite }) {
    if (solicitante?.rol !== ROLES.OPERADOR_SOPORTE && solicitante?.rol !== ROLES.ADMINISTRADOR) {
      throw new ErrorDeDominio(
        'NO_AUTORIZADO',
        'Solo soporte y administración ven los viajes activos.',
      );
    }

    return paginarPorCursor({
      cursor,
      limite,
      listar: ({ antesDe, limite: cantidad }) =>
        repositorioViajes.listarActivos({ antesDe, limite: cantidad }),
    });
  };
}
