import { CobroSimulado } from '../../../../domain/entities/cobro-simulado.js';
import { ErrorDeDominio } from '../../../../domain/errors/error-de-dominio.js';

const CAMPOS = `
  id, viaje_id, monto_centavos, estado, creado_en, cobrado_en, referencia
`;

/**
 * Adaptador real del puerto RepositorioCobros sobre PostgreSQL.
 *
 * `viaje_id` es UNIQUE y `buscarPorViajeIdParaActualizar` usa SELECT ... FOR
 * UPDATE. Esas dos garantías, junto con la clave de idempotencia de la
 * operación, evitan cobrar dos veces el mismo viaje.
 */
export class PostgresCobroRepository {
  #baseDeDatos;

  constructor({ baseDeDatos }) {
    this.#baseDeDatos = baseDeDatos;
  }

  async crear(cobro, ejecutor) {
    const resultado = await this.#ejecutor(ejecutor).query(
      `INSERT INTO cobros_simulados (
         id, viaje_id, monto_centavos, estado, creado_en, cobrado_en, referencia
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (viaje_id) DO NOTHING`,
      [
        cobro.id,
        cobro.viajeId,
        cobro.montoCentavos,
        cobro.estado,
        cobro.creadoEn,
        cobro.cobradoEn,
        cobro.referencia,
      ],
    );

    return resultado.rowCount === 1;
  }

  async buscarPorViajeId(viajeId, ejecutor) {
    const { rows } = await this.#ejecutor(ejecutor).query(
      `SELECT ${CAMPOS} FROM cobros_simulados WHERE viaje_id = $1`,
      [viajeId],
    );

    return rows[0] ? mapearCobro(rows[0]) : null;
  }

  async buscarPorViajeIdParaActualizar(viajeId, ejecutor) {
    const { rows } = await this.#ejecutor(ejecutor).query(
      `SELECT ${CAMPOS} FROM cobros_simulados WHERE viaje_id = $1 FOR UPDATE`,
      [viajeId],
    );

    return rows[0] ? mapearCobro(rows[0]) : null;
  }

  async actualizar(cobro, ejecutor) {
    const resultado = await this.#ejecutor(ejecutor).query(
      `UPDATE cobros_simulados
          SET estado = $2,
              cobrado_en = $3,
              referencia = $4
        WHERE viaje_id = $1`,
      [cobro.viajeId, cobro.estado, cobro.cobradoEn, cobro.referencia],
    );

    if (resultado.rowCount === 0) {
      throw new ErrorDeDominio('NO_ENCONTRADO', 'El cobro no existe.');
    }
  }

  async verificarDisponibilidad() {
    try {
      await this.#baseDeDatos.query('SELECT 1 FROM cobros_simulados LIMIT 1');
      return true;
    } catch {
      return false;
    }
  }

  #ejecutor(ejecutor) {
    return ejecutor ?? this.#baseDeDatos;
  }
}

function mapearCobro(fila) {
  return new CobroSimulado({
    id: fila.id,
    viajeId: fila.viaje_id,
    montoCentavos: fila.monto_centavos,
    estado: fila.estado,
    creadoEn: fila.creado_en,
    cobradoEn: fila.cobrado_en,
    referencia: fila.referencia,
  });
}
