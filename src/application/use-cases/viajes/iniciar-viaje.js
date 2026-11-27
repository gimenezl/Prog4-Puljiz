import { ErrorDeDominio } from '../../../domain/errors/error-de-dominio.js';

/**
 * Caso de uso: el chofer asignado inicia el viaje.
 *
 * La fecha de inicio la pone el servidor con el reloj inyectable. Solo se
 * bloquea la fila del viaje; el estado de origen se valida en el dominio antes
 * de actualizar y el chofer ya estaba ocupado desde la asignación.
 */
export function crearIniciarViaje({ repositorioViajes, unidadDeTrabajo, reloj }) {
  return async function iniciarViaje({ viajeId, choferId }) {
    return unidadDeTrabajo.ejecutar(async (tx) => {
      const viaje = await repositorioViajes.buscarPorIdParaActualizar(viajeId, tx);

      if (!viaje) {
        throw new ErrorDeDominio('NO_ENCONTRADO', 'El viaje no existe.');
      }

      if (viaje.choferId !== choferId) {
        throw new ErrorDeDominio(
          'NO_AUTORIZADO',
          'Solo el chofer asignado puede iniciar este viaje.',
        );
      }

      const iniciado = viaje.iniciar(reloj.ahora());
      await repositorioViajes.actualizar(iniciado, tx);

      return iniciado;
    });
  };
}
