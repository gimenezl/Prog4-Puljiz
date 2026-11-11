import pg from 'pg';

const { Pool } = pg;

/**
 * Adaptador real de base de datos PostgreSQL.
 * Solo expone infraestructura de conexión: las consultas de negocio
 * deben hacerse a través de los repositorios definidos como puertos.
 */
export class PostgresDatabase {
  #pool;

  constructor({
    connectionString,
    ssl = false,
    max = 10,
    connectionTimeoutMs = 5000,
    statementTimeoutMs = 5000,
    logger,
  }) {
    this.#pool = new Pool({
      connectionString,
      ssl: ssl ? { rejectUnauthorized: true } : false,
      max,
      connectionTimeoutMillis: connectionTimeoutMs,
      statement_timeout: statementTimeoutMs,
      idleTimeoutMillis: 30000,
      application_name: 'prog4-puljiz',
    });

    this.#pool.on('error', (error) => {
      logger?.error({ err: error }, 'Error en una conexión inactiva de PostgreSQL');
    });
  }

  async verificarConexion() {
    const { rows } = await this.#pool.query('SELECT 1::int AS ok');
    return rows[0]?.ok === 1;
  }

  async query(texto, parametros = []) {
    return this.#pool.query(texto, parametros);
  }

  /**
   * Ejecuta una operación dentro de una transacción. La operación recibe un
   * ejecutor con la misma interfaz que este adaptador (`query`) para que los
   * repositorios usen la conexión reservada.
   *
   * Los errores de serialización y los interbloqueos se reintentan una
   * cantidad limitada de veces: la transacción se revierte completa antes de
   * volver a intentar.
   */
  async transaccion(operacion, { reintentos = 2 } = {}) {
    for (let intento = 0; ; intento += 1) {
      const cliente = await this.#pool.connect();

      try {
        await cliente.query('BEGIN');
        const resultado = await operacion(cliente);
        await cliente.query('COMMIT');

        return resultado;
      } catch (error) {
        try {
          await cliente.query('ROLLBACK');
        } catch {
          // La conexión ya puede estar inutilizable; se libera igual.
        }

        if (intento < reintentos && esErrorReintentable(error)) {
          continue;
        }

        throw error;
      } finally {
        cliente.release();
      }
    }
  }

  async cerrar() {
    await this.#pool.end();
  }
}

function esErrorReintentable(error) {
  // 40001: serialization_failure. 40P01: deadlock_detected.
  return error?.code === '40001' || error?.code === '40P01';
}
