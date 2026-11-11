import { ROLES } from '../../../domain/entities/usuario.js';
import { ErrorDeDominio } from '../../../domain/errors/error-de-dominio.js';

/**
 * Caso de uso: consultar el perfil operativo de un chofer.
 *
 * Un chofer solo ve su propio perfil. Un administrador puede consultar el de
 * cualquier chofer.
 */
export function crearObtenerPerfilChofer({ repositorioChoferes }) {
  return async function obtenerPerfilChofer({ usuarioId, solicitante }) {
    const esPropietario = solicitante?.usuarioId === usuarioId;
    const esAdministrador = solicitante?.rol === ROLES.ADMINISTRADOR;

    if (!esPropietario && !esAdministrador) {
      throw new ErrorDeDominio('NO_AUTORIZADO', 'No tenés permiso para ver este perfil.');
    }

    const chofer = await repositorioChoferes.buscarPorUsuarioId(usuarioId);

    if (!chofer) {
      throw new ErrorDeDominio('NO_ENCONTRADO', 'El perfil de chofer no existe.');
    }

    return chofer;
  };
}
