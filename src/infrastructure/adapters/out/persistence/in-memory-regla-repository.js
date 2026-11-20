import { ESTADOS_CONFIGURACION } from '../../../../domain/entities/tarifa.js';
import { ErrorDeDominio } from '../../../../domain/errors/error-de-dominio.js';

/**
 * Adaptador falso del puerto RepositorioReglas. Asigna la versión al publicar
 * con el mismo criterio que la base: max(version)+1 de la tabla completa.
 */
export class InMemoryReglaRepository {
  #porId = new Map();

  async crear(regla, _ejecutor) {
    if (this.#porId.has(regla.id)) {
      throw new Error('Ya existe una regla con el mismo identificador.');
    }

    this.#porId.set(regla.id, regla);
    return regla;
  }

  async buscarPorId(id, _ejecutor) {
    return this.#porId.get(id) ?? null;
  }

  async actualizar(regla, _ejecutor) {
    const existente = this.#porId.get(regla.id);

    if (!existente) {
      throw new ErrorDeDominio('NO_ENCONTRADO', 'La regla no existe.');
    }

    if (existente.estado === ESTADOS_CONFIGURACION.PUBLICADA) {
      throw new ErrorDeDominio(
        'VERSION_YA_PUBLICADA',
        'La regla ya está publicada; publique una versión nueva.',
      );
    }

    this.#porId.set(regla.id, regla);
    return regla;
  }

  async listar(_ejecutor) {
    return [...this.#porId.values()];
  }

  async vigente(ahora, _ejecutor) {
    return (
      this.#publicadas()
        .filter((regla) => regla.vigenteDesde.getTime() <= ahora.getTime())
        .sort((a, b) => b.version - a.version)[0] ?? null
    );
  }

  async publicar(regla, _ejecutor) {
    const existente = this.#porId.get(regla.id);

    if (!existente) {
      throw new ErrorDeDominio('NO_ENCONTRADO', 'La regla no existe.');
    }

    if (existente.estado === ESTADOS_CONFIGURACION.PUBLICADA) {
      throw new ErrorDeDominio(
        'VERSION_YA_PUBLICADA',
        'La regla ya está publicada; publique una versión nueva.',
      );
    }

    const version =
      this.#publicadas().reduce((maxima, actual) => Math.max(maxima, actual.version), 0) + 1;
    const publicada = regla.conVersion(version);

    this.#porId.set(regla.id, publicada);
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
      (regla) => regla.estado === ESTADOS_CONFIGURACION.PUBLICADA,
    );
  }
}
