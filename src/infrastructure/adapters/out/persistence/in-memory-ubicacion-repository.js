/**
 * Adaptador falso del puerto RepositorioUbicaciones.
 *
 * Igual que el real, no reemplaza una ubicación por otra más vieja.
 */
export class InMemoryUbicacionRepository {
  #porChoferId = new Map();

  async guardar(ubicacion, _ejecutor) {
    const actual = this.#porChoferId.get(ubicacion.choferId);

    if (actual && actual.actualizadaEn.getTime() > ubicacion.actualizadaEn.getTime()) {
      return;
    }

    this.#porChoferId.set(ubicacion.choferId, ubicacion);
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
