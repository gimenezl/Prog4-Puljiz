import { ErrorDeDominio } from '../../../domain/errors/error-de-dominio.js';

/**
 * Caso de uso: el chofer asignado marca el viaje en camino.
 *
 * Solo se bloquea la fila del viaje: la transición no toca al chofer. El
 * estado de origen se valida en el dominio antes de actualizar; PostgreSQL
 * serializa la operación con SELECT ... FOR UPDATE.
 */
export function crearMarcarEnCamino({ repositorioViajes, unidadDeTrabajo }) {
  return async function marcarEnCamino({ viajeId, choferId }) {
    return unidadDeTrabajo.ejecutar(async (tx) => {
      const viaje = await repositorioViajes.buscarPorIdParaActualizar(viajeId, tx);

      if (!viaje) {
        throw new ErrorDeDominio('NO_ENCONTRADO', 'El viaje no existe.');
      }

      if (viaje.choferId !== choferId) {
        throw new ErrorDeDominio(
          'NO_AUTORIZADO',
          'Solo el chofer asignado puede marcar este viaje en camino.',
        );
      }

      const enCamino = viaje.marcarEnCamino();
      await repositorioViajes.actualizar(enCamino, tx);

      return enCamino;
    });
  };
}
