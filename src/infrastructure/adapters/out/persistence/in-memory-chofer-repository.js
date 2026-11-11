import { ErrorDeDominio } from '../../../../domain/errors/error-de-dominio.js';

/**
 * Adaptador falso del puerto RepositorioChoferes. Las entidades son inmutables,
 * así que una copia del mapa alcanza para la instantánea de la unidad de trabajo.
 */
export class InMemoryChoferRepository {
  #porUsuarioId = new Map();

  async crear(chofer, _ejecutor) {
    if (this.#porUsuarioId.has(chofer.usuarioId)) {
      throw new Error('Ya existe un perfil de chofer con el mismo usuario.');
    }

    this.#porUsuarioId.set(chofer.usuarioId, chofer);
  }

  async buscarPorUsuarioId(usuarioId, _ejecutor) {
    return this.#porUsuarioId.get(usuarioId) ?? null;
  }

  async buscarPorUsuarioIdParaActualizar(usuarioId, _ejecutor) {
    return this.#porUsuarioId.get(usuarioId) ?? null;
  }

  async actualizar(chofer, _ejecutor) {
    if (!this.#porUsuarioId.has(chofer.usuarioId)) {
      throw new ErrorDeDominio('NO_ENCONTRADO', 'El perfil de chofer no existe.');
    }

    this.#porUsuarioId.set(chofer.usuarioId, chofer);
  }

  async verificarDisponibilidad() {
    return true;
  }

  instantaneaMemoria() {
    return new Map(this.#porUsuarioId);
  }

  restaurarMemoria(instantanea) {
    this.#porUsuarioId = new Map(instantanea);
  }
}
