import { ErrorDeDominio } from '../../../../domain/errors/error-de-dominio.js';

/**
 * Adaptador falso del puerto RepositorioCobros.
 *
 * La unidad de trabajo en memoria serializa las operaciones, por lo que
 * `crear` es atómico respecto de otros reintentos: el segundo devuelve false.
 */
export class InMemoryCobroRepository {
  #porViajeId = new Map();

  async crear(cobro, _ejecutor) {
    if (this.#porViajeId.has(cobro.viajeId)) {
      return false;
    }

    this.#porViajeId.set(cobro.viajeId, cobro);
    return true;
  }

  async buscarPorViajeId(viajeId, _ejecutor) {
    return this.#porViajeId.get(viajeId) ?? null;
  }

  async buscarPorViajeIdParaActualizar(viajeId, _ejecutor) {
    return this.#porViajeId.get(viajeId) ?? null;
  }

  async actualizar(cobro, _ejecutor) {
    if (!this.#porViajeId.has(cobro.viajeId)) {
      throw new ErrorDeDominio('NO_ENCONTRADO', 'El cobro no existe.');
    }

    this.#porViajeId.set(cobro.viajeId, cobro);
  }

  async verificarDisponibilidad() {
    return true;
  }

  instantaneaMemoria() {
    return new Map(this.#porViajeId);
  }

  restaurarMemoria(instantanea) {
    this.#porViajeId = new Map(instantanea);
  }
}
