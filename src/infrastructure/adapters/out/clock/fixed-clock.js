/**
 * Adaptador falso del puerto Reloj para tests y para ADAPTERS_MODE=fake.
 * Permite fijar y avanzar el tiempo sin depender del reloj del sistema.
 */
export class FixedClock {
  #actual;

  constructor(ahora = new Date()) {
    this.#actual = new Date(ahora);
  }

  ahora() {
    return new Date(this.#actual);
  }

  fijar(ahora) {
    this.#actual = new Date(ahora);
  }

  avanzar(milisegundos) {
    this.#actual = new Date(this.#actual.getTime() + milisegundos);
  }
}
