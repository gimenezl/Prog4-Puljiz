import { ROLES } from '../../../domain/entities/usuario.js';
import { ErrorDeDominio } from '../../../domain/errors/error-de-dominio.js';

/**
 * Caso de uso: cancelar un viaje.
 *
 * El actor puede ser el pasajero dueño, el chofer asignado o un operador de
 * soporte (RF-15), que puede cancelar cualquier viaje activo, incluso EN_CURSO,
 * sin ser participante. El estado final y
 * los estados de origen válidos los decide el dominio según el vínculo con el
 * viaje, no el rol del token. Si el viaje ya tenía chofer, se libera en la
 * misma operación atómica; la fila del viaje se bloquea antes que la del
 * chofer para respetar el orden global de bloqueo.
 */
export function crearCancelarViaje({
  repositorioViajes,
  repositorioChoferes,
  unidadDeTrabajo,
  reloj,
}) {
  return async function cancelarViaje({ viajeId, actor, motivo }) {
    return unidadDeTrabajo.ejecutar(async (tx) => {
      const viaje = await repositorioViajes.buscarPorIdParaActualizar(viajeId, tx);

      if (!viaje) {
        throw new ErrorDeDominio('NO_ENCONTRADO', 'El viaje no existe.');
      }

      let cancelado;

      if (actor.rol === ROLES.OPERADOR_SOPORTE) {
        cancelado = viaje.cancelarPorSoporte(reloj.ahora(), motivo, actor.usuarioId);
      } else if (viaje.pasajeroId === actor.usuarioId) {
        cancelado = viaje.cancelarPorPasajero(reloj.ahora(), motivo);
      } else if (viaje.choferId !== null && viaje.choferId === actor.usuarioId) {
        cancelado = viaje.cancelarPorChofer(reloj.ahora(), motivo);
      } else {
        throw new ErrorDeDominio('NO_AUTORIZADO', 'No tenés permiso para cancelar este viaje.');
      }

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
