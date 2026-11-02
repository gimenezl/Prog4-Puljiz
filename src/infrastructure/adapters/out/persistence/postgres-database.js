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

  async ping() {
    const { rows } = await this.#pool.query('SELECT 1::int AS ok');
    return rows[0]?.ok === 1;
  }

  async query(texto, parametros = []) {
    return this.#pool.query(texto, parametros);
  }

  async close() {
    await this.#pool.end();
  }
}
