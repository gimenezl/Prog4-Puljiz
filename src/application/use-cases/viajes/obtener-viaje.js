import { ROLES } from '../../../domain/entities/usuario.js';
import { ErrorDeDominio } from '../../../domain/errors/error-de-dominio.js';

/**
 * Caso de uso: consultar un viaje.
 *
 * Pueden verlo el pasajero que lo pidió, el chofer asignado y los roles de
 * soporte o administración. La autorización vive aquí para que valga para
 * cualquier adaptador de entrada.
 */
export function crearObtenerViaje({ repositorioViajes }) {
  return async function obtenerViaje({ viajeId, solicitante }) {
    const viaje = await repositorioViajes.buscarPorId(viajeId);

    if (!viaje) {
      throw new ErrorDeDominio('NO_ENCONTRADO', 'El viaje no existe.');
    }

    const esParticipante = viaje.esParticipante(solicitante?.usuarioId);
    const puedeVerTodos =
      solicitante?.rol === ROLES.ADMINISTRADOR || solicitante?.rol === ROLES.OPERADOR_SOPORTE;

    if (!esParticipante && !puedeVerTodos) {
      throw new ErrorDeDominio('NO_AUTORIZADO', 'No tenés permiso para ver este viaje.');
    }

    return viaje;
  };
}
