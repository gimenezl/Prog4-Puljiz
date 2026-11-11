import { ErrorDeDominio } from '../../../../domain/errors/error-de-dominio.js';

/**
 * Adaptador falso del puerto RepositorioUsuarios para tests y ADAPTERS_MODE=fake.
 * Guarda las entidades en mapas y hace cumplir la unicidad del email.
 *
 * Expone una instantánea para que la unidad de trabajo en memoria pueda
 * revertir la operación completa si una escritura posterior falla.
 */
export class InMemoryUserRepository {
  #porId = new Map();
  #porEmail = new Map();

  async buscarPorId(id, _ejecutor) {
    return this.#porId.get(id) ?? null;
  }

  async buscarPorEmail(email, _ejecutor) {
    return this.#porEmail.get(String(email).trim().toLowerCase()) ?? null;
  }

  async crear(usuario, _ejecutor) {
    if (this.#porEmail.has(usuario.email)) {
      throw new ErrorDeDominio('EMAIL_YA_REGISTRADO', 'Ya existe una cuenta con ese email.');
    }

    this.#porId.set(usuario.id, usuario);
    this.#porEmail.set(usuario.email, usuario);
  }

  async actualizar(usuario, _ejecutor) {
    if (!this.#porId.has(usuario.id)) {
      throw new ErrorDeDominio('NO_ENCONTRADO', 'El usuario no existe.');
    }

    this.#porId.set(usuario.id, usuario);
    this.#porEmail.set(usuario.email, usuario);
  }

  async verificarDisponibilidad() {
    return true;
  }

  instantaneaMemoria() {
    return {
      porId: new Map(this.#porId),
      porEmail: new Map(this.#porEmail),
    };
  }

  restaurarMemoria(instantanea) {
    this.#porId = new Map(instantanea.porId);
    this.#porEmail = new Map(instantanea.porEmail);
  }
}
