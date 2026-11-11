/**
 * Adaptador falso del puerto RepositorioClavesIdempotencia.
 *
 * `crear` es atómico respecto de las demás operaciones porque la unidad de
 * trabajo en memoria serializa las transacciones. Devuelve false si el par
 * (alcance, clave) ya existe.
 */
export class InMemoryIdempotencyRepository {
  #registros = new Map();

  async buscar(alcance, clave, _ejecutor) {
    const registro = this.#registros.get(this.#llave(alcance, clave));
    return registro ? structuredClone(registro) : null;
  }

  async crear(registro, _ejecutor) {
    const llave = this.#llave(registro.alcance, registro.clave);

    if (this.#registros.has(llave)) {
      return false;
    }

    this.#registros.set(llave, structuredClone(registro));
    return true;
  }

  async eliminar(alcance, clave, _ejecutor) {
    this.#registros.delete(this.#llave(alcance, clave));
  }

  async verificarDisponibilidad() {
    return true;
  }

  instantaneaMemoria() {
    return new Map(this.#registros);
  }

  restaurarMemoria(instantanea) {
    this.#registros = new Map(instantanea);
  }

  #llave(alcance, clave) {
    return `${alcance}\u0000${clave}`;
  }
}
