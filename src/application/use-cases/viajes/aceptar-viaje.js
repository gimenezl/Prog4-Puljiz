import { ESTADOS_VIAJE } from '../../../domain/entities/viaje.js';
import { ErrorDeDominio } from '../../../domain/errors/error-de-dominio.js';
import { exigirUbicacionVigente } from '../../services/ubicacion-vigente.js';

/**
 * Caso de uso: aceptar un viaje.
 *
 * Se serializa por la fila del viaje y después por la fila del chofer. La
 * unidad de trabajo garantiza que, si dos choferes aceptan a la vez, solo uno
 * se lleve el viaje y que un chofer no quede ocupado en dos viajes. Además, el
 * chofer necesita una ubicación vigente (RF-03).
 */
export function crearAceptarViaje({
  repositorioViajes,
  repositorioChoferes,
  repositorioUbicaciones,
  unidadDeTrabajo,
  reloj,
  vigenciaUbicacionMs,
}) {
  return async function aceptarViaje({ viajeId, choferId }) {
    return unidadDeTrabajo.ejecutar(async (tx) => {
      const viaje = await repositorioViajes.buscarPorIdParaActualizar(viajeId, tx);

      if (!viaje) {
        throw new ErrorDeDominio('NO_ENCONTRADO', 'El viaje no existe.');
      }

      if (viaje.estado !== ESTADOS_VIAJE.SOLICITADO) {
        throw new ErrorDeDominio(
          'VIAJE_NO_DISPONIBLE',
          'El viaje ya no está disponible para ser aceptado.',
        );
      }

      const chofer = await repositorioChoferes.buscarPorUsuarioIdParaActualizar(choferId, tx);

      if (!chofer) {
        throw new ErrorDeDominio(
          'CHOFER_NO_ELEGIBLE',
          'El chofer no tiene un perfil operativo habilitado.',
        );
      }

      if (chofer.viajeActivoId !== null) {
        throw new ErrorDeDominio('CHOFER_OCUPADO', 'El chofer ya tiene un viaje activo.');
      }

      if (!chofer.habilitado || !chofer.disponible) {
        throw new ErrorDeDominio(
          'CHOFER_NO_ELEGIBLE',
          'El chofer no está habilitado y disponible para aceptar viajes.',
        );
      }

      const ahora = reloj.ahora();

      await exigirUbicacionVigente({
        repositorioUbicaciones,
        choferId,
        ahora,
        vigenciaMs: vigenciaUbicacionMs,
        ejecutor: tx,
      });

      const asignado = viaje.asignar(choferId, ahora);
      const ocupado = chofer.ocupar(viajeId);

      await repositorioViajes.actualizar(asignado, tx);
      await repositorioChoferes.actualizar(ocupado, tx);

      return asignado;
    });
  };
}
