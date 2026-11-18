import { ErrorDeDominio } from '../../../../domain/errors/error-de-dominio.js';

/**
 * Adaptador falso del puerto RepositorioVehiculos.
 *
 * Reproduce las dos restricciones UNIQUE de la tabla real: un vehículo por
 * chofer y una patente por vehículo.
 */
export class InMemoryVehiculoRepository {
  #porChoferId = new Map();

  async guardar(vehiculo, _ejecutor) {
    for (const existente of this.#porChoferId.values()) {
      if (existente.patente === vehiculo.patente && existente.choferId !== vehiculo.choferId) {
        throw new ErrorDeDominio(
          'PATENTE_YA_REGISTRADA',
          'La patente ya está registrada en otro vehículo.',
        );
      }
    }

    this.#porChoferId.set(vehiculo.choferId, vehiculo);
  }

  async buscarPorChoferId(choferId, _ejecutor) {
    return this.#porChoferId.get(choferId) ?? null;
  }

  async verificarDisponibilidad() {
    return true;
  }

  instantaneaMemoria() {
    return new Map(this.#porChoferId);
  }

  restaurarMemoria(instantanea) {
    this.#porChoferId = new Map(instantanea);
  }
}
