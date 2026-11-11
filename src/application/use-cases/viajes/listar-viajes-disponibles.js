import { ErrorDeDominio } from '../../../domain/errors/error-de-dominio.js';

const LIMITE_POR_DEFECTO = 50;
const LIMITE_MAXIMO = 100;

/**
 * Caso de uso: listar los viajes solicitados que puede aceptar un chofer.
 *
 * Solo un chofer habilitado, disponible y libre recibe la lista. La validación
 * definitiva se repite al aceptar, porque entre la consulta y la aceptación
 * otro chofer puede haberse quedado con el viaje.
 */
export function crearListarViajesDisponibles({ repositorioViajes, repositorioChoferes }) {
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

    return repositorioViajes.listarSolicitados(cantidad);
  };
}
