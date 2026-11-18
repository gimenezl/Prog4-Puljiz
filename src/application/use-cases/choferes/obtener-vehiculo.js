import { ROLES } from '../../../domain/entities/usuario.js';
import { ErrorDeDominio } from '../../../domain/errors/error-de-dominio.js';

/**
 * Caso de uso: consultar el vehículo de un chofer.
 *
 * Lo ve el propio chofer, y también el administrador y el operador de soporte
 * (docs/modelo.md §3). El pasajero lo verá a través de su viaje asignado.
 */
export function crearObtenerVehiculo({ repositorioVehiculos }) {
  return async function obtenerVehiculo({ choferId, solicitante }) {
    const esPropietario = solicitante?.usuarioId === choferId;
    const puedeVerTodos =
      solicitante?.rol === ROLES.ADMINISTRADOR || solicitante?.rol === ROLES.OPERADOR_SOPORTE;

    if (!esPropietario && !puedeVerTodos) {
      throw new ErrorDeDominio('NO_AUTORIZADO', 'No tenés permiso para ver este vehículo.');
    }

    const vehiculo = await repositorioVehiculos.buscarPorChoferId(choferId);

    if (!vehiculo) {
      throw new ErrorDeDominio('NO_ENCONTRADO', 'El chofer todavía no registró un vehículo.');
    }

    return vehiculo;
  };
}
