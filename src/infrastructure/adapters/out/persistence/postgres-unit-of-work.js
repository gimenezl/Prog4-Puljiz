/**
 * Unidad de trabajo real: delega en una transacción de PostgreSQL.
 * La conexión reservada se pasa a los repositorios como contexto opaco.
 */
export class PostgresUnitOfWork {
  #baseDeDatos;

  constructor({ baseDeDatos }) {
    this.#baseDeDatos = baseDeDatos;
  }

  ejecutar(operacion) {
    return this.#baseDeDatos.transaccion(operacion);
  }
}
