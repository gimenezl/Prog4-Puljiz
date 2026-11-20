import { ROLES } from '../../../domain/entities/usuario.js';
import { Vehiculo } from '../../../domain/entities/vehiculo.js';
import { ErrorDeDominio } from '../../../domain/errors/error-de-dominio.js';

/**
 * Caso de uso: el chofer registra su vehículo o edita sus datos.
 *
 * Un chofer tiene a lo sumo un vehículo: si ya tenía uno, se reemplazan los
 * datos y se conserva el id. La unicidad de la patente la garantiza el
 * repositorio (PATENTE_YA_REGISTRADA).
 */
export function crearGuardarVehiculo({
  repositorioChoferes,
  repositorioVehiculos,
  unidadDeTrabajo,
  generadorIds,
}) {
  return async function guardarVehiculo({ choferId, solicitante, datos }) {
    if (solicitante?.rol !== ROLES.CHOFER || solicitante.usuarioId !== choferId) {
      throw new ErrorDeDominio('NO_AUTORIZADO', 'Solo el propio chofer puede cargar su vehículo.');
    }

    return unidadDeTrabajo.ejecutar(async (tx) => {
      const chofer = await repositorioChoferes.buscarPorUsuarioId(choferId, tx);

      if (!chofer) {
        throw new ErrorDeDominio('NO_ENCONTRADO', 'El perfil de chofer no existe.');
      }

      const existente = await repositorioVehiculos.buscarPorChoferId(choferId, tx);
      const vehiculo = existente
        ? existente.conDatos(datos)
        : new Vehiculo({ id: generadorIds.generar(), choferId, ...datos });

      await repositorioVehiculos.guardar(vehiculo, tx);

      return { vehiculo, creado: !existente };
    });
  };
}
