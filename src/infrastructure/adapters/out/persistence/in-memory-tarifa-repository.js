import { ESTADOS_CONFIGURACION } from '../../../../domain/entities/tarifa.js';
import { ErrorDeDominio } from '../../../../domain/errors/error-de-dominio.js';

/**
 * Adaptador falso del puerto RepositorioTarifas. Asigna la versión al publicar
 * con el mismo criterio que la base: max(version)+1 de la tabla completa.
 */
export class InMemoryTarifaRepository {
  #porId = new Map();

  async crear(tarifa, _ejecutor) {
    if (this.#porId.has(tarifa.id)) {
      throw new Error('Ya existe una tarifa con el mismo identificador.');
    }

    this.#porId.set(tarifa.id, tarifa);
    return tarifa;
  }

  async buscarPorId(id, _ejecutor) {
    return this.#porId.get(id) ?? null;
  }

  async actualizar(tarifa, _ejecutor) {
    const existente = this.#porId.get(tarifa.id);

    if (!existente) {
      throw new ErrorDeDominio('NO_ENCONTRADO', 'La tarifa no existe.');
    }

    if (existente.estado === ESTADOS_CONFIGURACION.PUBLICADA) {
      throw new ErrorDeDominio(
        'VERSION_YA_PUBLICADA',
        'La tarifa ya está publicada; publique una versión nueva.',
      );
    }

    this.#porId.set(tarifa.id, tarifa);
    return tarifa;
  }

  async listar(_ejecutor) {
    return [...this.#porId.values()];
  }

  async vigente(ahora, _ejecutor) {
    return (
      this.#publicadas()
        .filter((tarifa) => tarifa.vigenteDesde.getTime() <= ahora.getTime())
        .sort((a, b) => b.version - a.version)[0] ?? null
    );
  }

  async publicar(tarifa, _ejecutor) {
    const existente = this.#porId.get(tarifa.id);

    if (!existente) {
      throw new ErrorDeDominio('NO_ENCONTRADO', 'La tarifa no existe.');
    }

    if (existente.estado === ESTADOS_CONFIGURACION.PUBLICADA) {
      throw new ErrorDeDominio(
        'VERSION_YA_PUBLICADA',
        'La tarifa ya está publicada; publique una versión nueva.',
      );
    }

    const version =
      this.#publicadas().reduce((maxima, actual) => Math.max(maxima, actual.version), 0) + 1;
    const publicada = tarifa.conVersion(version);

    this.#porId.set(tarifa.id, publicada);
    return publicada;
  }

  async verificarDisponibilidad() {
    return true;
  }

  instantaneaMemoria() {
    return new Map(this.#porId);
  }

  restaurarMemoria(instantanea) {
    this.#porId = new Map(instantanea);
  }

  #publicadas() {
    return [...this.#porId.values()].filter(
      (tarifa) => tarifa.estado === ESTADOS_CONFIGURACION.PUBLICADA,
    );
  }
}
