/**
 * Adaptador falso de base de datos para tests y para ADAPTERS_MODE=fake.
 * No persiste datos: las implementaciones en memoria de los repositorios
 * se agregarán cuando existan los casos de uso correspondientes.
 */
export class InMemoryDatabase {
  #abierta = true;

  async ping() {
    return this.#abierta;
  }

  async close() {
    this.#abierta = false;
  }
}
