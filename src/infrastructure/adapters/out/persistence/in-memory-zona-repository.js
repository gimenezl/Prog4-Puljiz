import { ErrorDeDominio } from '../../../../domain/errors/error-de-dominio.js';
import { puntoDentroDePoligono, poligonosSeSolapan } from '../geografia/poligono.js';

/**
 * Adaptador falso del puerto RepositorioZonas. Reproduce la restricción de no
 * solapamiento entre zonas activas y el borrado lógico (solo `activa=false`).
 */
export class InMemoryZonaRepository {
  #porId = new Map();

  async crear(zona, _ejecutor) {
    if (zona.activa) this.#validarSinSolape(zona);

    this.#porId.set(zona.id, zona);
    return zona;
  }

  async buscarPorId(id, _ejecutor) {
    return this.#porId.get(id) ?? null;
  }

  async listar({ activa } = {}, _ejecutor) {
    return [...this.#porId.values()].filter(
      (zona) => activa === undefined || zona.activa === activa,
    );
  }

  async zonaDe(punto, _ahora, _ejecutor) {
    const coords = punto.aJSON ? punto.aJSON() : punto;

    return (
      [...this.#porId.values()].find(
        (zona) => zona.activa && puntoDentroDePoligono(coords, zona.criterio.puntos),
      ) ?? null
    );
  }

  async actualizar(zona, _ejecutor) {
    const actual = this.#porId.get(zona.id);

    if (!actual) {
      throw new ErrorDeDominio('NO_ENCONTRADO', 'La zona no existe.');
    }

    if (zona.activa) this.#validarSinSolape(zona);

    this.#porId.set(zona.id, zona);
    return zona;
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

  #validarSinSolape(zona) {
    for (const existente of this.#porId.values()) {
      if (
        existente.activa &&
        existente.id !== zona.id &&
        poligonosSeSolapan(zona.criterio.puntos, existente.criterio.puntos)
      ) {
        throw new ErrorDeDominio('ZONAS_SUPERPUESTAS', 'La zona se solapa con otra zona activa.');
      }
    }
  }
}
