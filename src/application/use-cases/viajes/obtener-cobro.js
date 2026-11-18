import { ROLES } from '../../../domain/entities/usuario.js';
import { ErrorDeDominio } from '../../../domain/errors/error-de-dominio.js';

/**
 * Caso de uso: consultar el cobro simulado de un viaje.
 *
 * Lo pueden ver el pasajero que pidió el viaje, el chofer asignado, un
 * administrador o un operador de soporte. La autorización se resuelve sobre el
 * viaje, igual que en `obtener-viaje`.
 */
export function crearObtenerCobro({ repositorioViajes, repositorioCobros }) {
  return async function obtenerCobro({ viajeId, solicitante }) {
    const viaje = await repositorioViajes.buscarPorId(viajeId);

    if (!viaje) {
      throw new ErrorDeDominio('NO_ENCONTRADO', 'El viaje no existe.');
    }

    const esParticipante = viaje.esParticipante(solicitante?.usuarioId);
    const puedeVerTodos =
      solicitante?.rol === ROLES.ADMINISTRADOR || solicitante?.rol === ROLES.OPERADOR_SOPORTE;

    if (!esParticipante && !puedeVerTodos) {
      throw new ErrorDeDominio('NO_AUTORIZADO', 'No tenés permiso para ver este cobro.');
    }

    const cobro = await repositorioCobros.buscarPorViajeId(viajeId);

    if (!cobro) {
      throw new ErrorDeDominio('NO_ENCONTRADO', 'El viaje todavía no tiene un cobro registrado.');
    }

    return cobro;
  };
}
