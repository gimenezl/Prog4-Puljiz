/**
 * Unidad de trabajo para los adaptadores en memoria.
 *
 * Serializa las operaciones para que dos transacciones no se intercalen, y
 * toma una instantánea de los repositorios participantes antes de ejecutar.
 * Si la operación falla, restaura la instantánea completa: así se cumple la
 * misma garantía de atomicidad que aporta PostgreSQL.
 */
export class InMemoryUnitOfWork {
  #participantes;
  #cola = Promise.resolve();

  constructor({ participantes = [] } = {}) {
    this.#participantes = participantes.filter(
      (participante) =>
        typeof participante?.instantaneaMemoria === 'function' &&
        typeof participante?.restaurarMemoria === 'function',
    );
  }

  ejecutar(operacion) {
    const turno = this.#cola.then(() => this.#ejecutarAislada(operacion));

    // La cola no debe quedar rechazada: el error se propaga al llamador.
    this.#cola = turno.then(
      () => undefined,
      () => undefined,
    );

    return turno;
  }

  async #ejecutarAislada(operacion) {
    const instantaneas = this.#participantes.map((participante) => [
      participante,
      participante.instantaneaMemoria(),
    ]);

    try {
      return await operacion({ tipo: 'memoria' });
    } catch (error) {
      for (let indice = instantaneas.length - 1; indice >= 0; indice -= 1) {
        const [participante, instantanea] = instantaneas[indice];
        participante.restaurarMemoria(instantanea);
      }

      throw error;
    }
  }
}
