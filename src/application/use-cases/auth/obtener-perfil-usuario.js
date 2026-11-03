import { ROLES } from '../../../domain/entities/usuario.js';
import { ErrorDeDominio } from '../../../domain/errors/error-de-dominio.js';

/**
 * Caso de uso: consultar el perfil de un usuario.
 *
 * Autorización por recurso: solo el propietario o un administrador pueden ver
 * la cuenta. La regla vive aquí, no en el controlador HTTP, para que se aplique
 * a cualquier adaptador de entrada.
 */
export function crearObtenerPerfilUsuario({ repositorioUsuarios }) {
  return async function obtenerPerfilUsuario({ usuarioId, solicitante }) {
    const usuario = await repositorioUsuarios.buscarPorId(usuarioId);

    if (!usuario) {
      throw new ErrorDeDominio('NO_ENCONTRADO', 'El usuario no existe.');
    }

    const esPropietario = solicitante?.usuarioId === usuario.id;
    const esAdministrador = solicitante?.rol === ROLES.ADMINISTRADOR;

    if (!esPropietario && !esAdministrador) {
      throw new ErrorDeDominio('NO_AUTORIZADO', 'No tenés permiso para ver este usuario.');
    }

    return usuario;
  };
}
