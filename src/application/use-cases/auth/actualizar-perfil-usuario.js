import { ErrorDeDominio } from '../../../domain/errors/error-de-dominio.js';

/**
 * Caso de uso: actualizar el perfil propio.
 *
 * Solo el propietario puede modificar su cuenta. Un administrador puede ver
 * otras cuentas, pero no editarlas. El email y el rol no son editables por este
 * flujo: el controlador rechaza cualquier campo no declarado.
 */
export function crearActualizarPerfilUsuario({ repositorioUsuarios }) {
  return async function actualizarPerfilUsuario({ usuarioId, solicitante, nombre }) {
    const usuario = await repositorioUsuarios.buscarPorId(usuarioId);

    if (!usuario) {
      throw new ErrorDeDominio('NO_ENCONTRADO', 'El usuario no existe.');
    }

    if (solicitante?.usuarioId !== usuario.id) {
      throw new ErrorDeDominio('NO_AUTORIZADO', 'No tenés permiso para editar este usuario.');
    }

    const actualizado = usuario.conNombre(nombre);
    await repositorioUsuarios.actualizar(actualizado);

    return actualizado;
  };
}
