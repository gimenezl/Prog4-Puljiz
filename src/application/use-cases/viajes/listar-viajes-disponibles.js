import { ErrorDeDominio } from '../../../domain/errors/error-de-dominio.js';
import { exigirUbicacionVigente } from '../../services/ubicacion-vigente.js';

const LIMITE_POR_DEFECTO = 50;
const LIMITE_MAXIMO = 100;

/**
 * Caso de uso: listar los viajes solicitados que puede aceptar un chofer.
 *
 * Solo un chofer habilitado, disponible, libre y con ubicación vigente recibe
 * la lista, y solo ve los viajes cuyo origen está dentro de `radioBusquedaM`
 * de su ubicación, del más cercano al más lejano (RF-06). La validación
 * definitiva se repite al aceptar, porque entre la consulta y la aceptación
 * otro chofer puede haberse quedado con el viaje.
 *
 * Devuelve `[{ viaje, distanciaM }]`.
 */
export function crearListarViajesDisponibles({
  repositorioViajes,
  repositorioChoferes,
  repositorioUbicaciones,
  reloj,
  vigenciaUbicacionMs,
  radioBusquedaM,
}) {
  return async function listarViajesDisponibles({ choferId, limite = LIMITE_POR_DEFECTO }) {
    const cantidad = Number.isInteger(limite)
      ? Math.min(Math.max(limite, 1), LIMITE_MAXIMO)
      : LIMITE_POR_DEFECTO;

    const chofer = await repositorioChoferes.buscarPorUsuarioId(choferId);

    if (!chofer) {
      throw new ErrorDeDominio(
        'CHOFER_NO_ELEGIBLE',
        'El chofer no tiene un perfil operativo habilitado.',
      );
    }

    if (!chofer.estaElegible()) {
      throw new ErrorDeDominio(
        'CHOFER_NO_ELEGIBLE',
        'El chofer no está habilitado y disponible para aceptar viajes.',
      );
    }

    const ubicacion = await exigirUbicacionVigente({
      repositorioUbicaciones,
      choferId,
      ahora: reloj.ahora(),
      vigenciaMs: vigenciaUbicacionMs,
    });

    // La ubicación vigente del chofer es el centro de la búsqueda.
    return repositorioViajes.listarSolicitadosCerca(
      ubicacion.punto.aJSON(),
      radioBusquedaM,
      cantidad,
    );
  };
}
