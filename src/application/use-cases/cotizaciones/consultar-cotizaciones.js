import { ROLES } from '../../../domain/entities/usuario.js';
import { ErrorDeDominio } from '../../../domain/errors/error-de-dominio.js';

function verificarAcceso(cotizacion, actor) {
  if (cotizacion.pasajeroId !== actor.id && actor.rol !== ROLES.ADMINISTRADOR) {
    throw new ErrorDeDominio('NO_AUTORIZADO', 'La cotización pertenece a otro pasajero.');
  }
}

export function crearObtenerCotizacion({ repositorioCotizaciones, reloj }) {
  return async function obtenerCotizacion({ cotizacionId, actor }) {
    const cotizacion = await repositorioCotizaciones.buscarPorId(cotizacionId);

    if (!cotizacion) {
      throw new ErrorDeDominio('NO_ENCONTRADO', 'La cotización no existe.');
    }

    verificarAcceso(cotizacion, actor);

    return cotizacion.aVistaPublica(reloj.ahora());
  };
}

export function crearListarCotizaciones({ repositorioCotizaciones, reloj }) {
  return async function listarCotizaciones({ pasajeroId, actor }) {
    if (actor.rol !== ROLES.ADMINISTRADOR && actor.id !== pasajeroId) {
      throw new ErrorDeDominio('NO_AUTORIZADO', 'No puede listar cotizaciones de otro pasajero.');
    }

    const cotizaciones = await repositorioCotizaciones.listarPorPasajero(pasajeroId);
    const ahora = reloj.ahora();

    return cotizaciones.map((cotizacion) => cotizacion.aVistaPublica(ahora));
  };
}
