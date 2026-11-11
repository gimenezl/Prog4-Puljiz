/**
 * Adaptador real del puerto RepositorioClavesIdempotencia sobre PostgreSQL.
 *
 * La clave primaria compuesta (alcance, clave) es la garantía de que una
 * operación se registra una sola vez. `crear` usa ON CONFLICT DO NOTHING para
 * no abortar la transacción: devuelve false y el caso de uso revierte todo y
 * recupera la respuesta ganadora.
 */
export class PostgresIdempotencyRepository {
  #baseDeDatos;

  constructor({ baseDeDatos }) {
    this.#baseDeDatos = baseDeDatos;
  }

  async buscar(alcance, clave, ejecutor) {
    const { rows } = await this.#ejecutor(ejecutor).query(
      `SELECT alcance, clave, hash_contenido, respuesta, creada_en, vence_en
         FROM claves_idempotencia
        WHERE alcance = $1 AND clave = $2`,
      [alcance, clave],
    );

    return rows[0] ? mapearRegistro(rows[0]) : null;
  }

  async crear(registro, ejecutor) {
    const resultado = await this.#ejecutor(ejecutor).query(
      `INSERT INTO claves_idempotencia (
         alcance, clave, hash_contenido, respuesta, creada_en, vence_en
       ) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (alcance, clave) DO NOTHING`,
      [
        registro.alcance,
        registro.clave,
        registro.hashContenido,
        JSON.stringify(registro.respuesta),
        registro.creadaEn,
        registro.venceEn,
      ],
    );

    return resultado.rowCount === 1;
  }

  async eliminar(alcance, clave, ejecutor) {
    await this.#ejecutor(ejecutor).query(
      'DELETE FROM claves_idempotencia WHERE alcance = $1 AND clave = $2',
      [alcance, clave],
    );
  }

  async verificarDisponibilidad() {
    try {
      await this.#baseDeDatos.query('SELECT 1 FROM claves_idempotencia LIMIT 1');
      return true;
    } catch {
      return false;
    }
  }

  #ejecutor(ejecutor) {
    return ejecutor ?? this.#baseDeDatos;
  }
}

function mapearRegistro(fila) {
  return {
    alcance: fila.alcance,
    clave: fila.clave,
    hashContenido: fila.hash_contenido,
    respuesta: fila.respuesta,
    creadaEn: fila.creada_en,
    venceEn: fila.vence_en,
  };
}
