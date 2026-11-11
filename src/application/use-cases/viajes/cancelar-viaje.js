import { ErrorDeDominio } from '../../../domain/errors/error-de-dominio.js';

/**
 * Caso de uso: cancelar un viaje propio.
 *
 * Si el viaje ya tenía chofer, se libera en la misma operación atómica. La
 * fila del viaje se bloquea antes que la del chofer para respetar el orden
 * global de bloqueo.
 */
export function crearCancelarViaje({
  repositorioViajes,
  repositorioChoferes,
  unidadDeTrabajo,
  reloj,
}) {
  return async function cancelarViaje({ viajeId, pasajeroId, motivo }) {
    return unidadDeTrabajo.ejecutar(async (tx) => {
      const viaje = await repositorioViajes.buscarPorIdParaActualizar(viajeId, tx);

      if (!viaje) {
        throw new ErrorDeDominio('NO_ENCONTRADO', 'El viaje no existe.');
      }

      if (viaje.pasajeroId !== pasajeroId) {
        throw new ErrorDeDominio('NO_AUTORIZADO', 'No tenés permiso para cancelar este viaje.');
      }

      const cancelado = viaje.cancelarPorPasajero(reloj.ahora(), motivo);
      await repositorioViajes.actualizar(cancelado, tx);

      if (viaje.choferId !== null) {
        const chofer = await repositorioChoferes.buscarPorUsuarioIdParaActualizar(
          viaje.choferId,
          tx,
        );

        if (chofer) {
          await repositorioChoferes.actualizar(chofer.liberar(viaje.id), tx);
        }
      }

      return cancelado;
    });
  };
}
