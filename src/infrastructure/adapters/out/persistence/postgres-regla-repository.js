import { ReglaDeMultiplicador } from '../../../../domain/entities/regla-de-multiplicador.js';
import { ErrorDeDominio } from '../../../../domain/errors/error-de-dominio.js';

const CAMPOS = `
  id, estado, version, formula, umbral_inferior, umbral_superior,
  multiplicador_minimo, multiplicador_maximo, escala_multiplicador,
  vigente_desde, motivo, publicada_por_id, publicada_en, creada_en
`;
const VIOLACION_DE_RESTRICCION = '23514';

/** Adaptador real del puerto RepositorioReglas sobre PostgreSQL. */
export class PostgresReglaRepository {
  #baseDeDatos;

  constructor({ baseDeDatos }) {
    this.#baseDeDatos = baseDeDatos;
  }

  async crear(regla, ejecutor) {
    await this.#ejecutor(ejecutor).query(
      `INSERT INTO reglas_multiplicador (
         id, umbral_inferior, umbral_superior, multiplicador_minimo,
         multiplicador_maximo, escala_multiplicador, creada_en
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        regla.id,
        regla.umbralInferior,
        regla.umbralSuperior,
        regla.multiplicadorMinimo,
        regla.multiplicadorMaximo,
        regla.escalaMultiplicador,
        regla.creadaEn,
      ],
    );

    return regla;
  }

  async buscarPorId(id, ejecutor) {
    const { rows } = await this.#ejecutor(ejecutor).query(
      `SELECT ${CAMPOS} FROM reglas_multiplicador WHERE id = $1`,
      [id],
    );

    return rows[0] ? mapearRegla(rows[0]) : null;
  }

  async actualizar(regla, ejecutor) {
    try {
      const resultado = await this.#ejecutor(ejecutor).query(
        `UPDATE reglas_multiplicador
            SET umbral_inferior = $2,
                umbral_superior = $3,
                multiplicador_minimo = $4,
                multiplicador_maximo = $5,
                escala_multiplicador = $6
          WHERE id = $1 AND estado = 'BORRADOR'`,
        [
          regla.id,
          regla.umbralInferior,
          regla.umbralSuperior,
          regla.multiplicadorMinimo,
          regla.multiplicadorMaximo,
          regla.escalaMultiplicador,
        ],
      );

      if (resultado.rowCount === 0) {
        const existente = await this.buscarPorId(regla.id, ejecutor);

        if (!existente) throw new ErrorDeDominio('NO_ENCONTRADO', 'La regla no existe.');

        throw new ErrorDeDominio(
          'VERSION_YA_PUBLICADA',
          'La regla ya está publicada; publique una versión nueva.',
        );
      }
    } catch (error) {
      if (error instanceof ErrorDeDominio) throw error;
      throw traducirError(error);
    }

    return regla;
  }

  async listar(ejecutor) {
    const { rows } = await this.#ejecutor(ejecutor).query(
      `SELECT ${CAMPOS} FROM reglas_multiplicador ORDER BY creada_en DESC, id ASC`,
    );

    return rows.map(mapearRegla);
  }

  async vigente(ahora, ejecutor) {
    const { rows } = await this.#ejecutor(ejecutor).query(
      `SELECT ${CAMPOS}
         FROM reglas_multiplicador
        WHERE estado = 'PUBLICADA'
          AND vigente_desde <= $1
        ORDER BY version DESC
        LIMIT 1`,
      [ahora],
    );

    return rows[0] ? mapearRegla(rows[0]) : null;
  }

  async publicar(regla, ejecutor) {
    let fila;

    try {
      const resultado = await this.#ejecutor(ejecutor).query(
        `UPDATE reglas_multiplicador
            SET estado = 'PUBLICADA',
                publicada_por_id = $2,
                publicada_en = $3,
                vigente_desde = $4,
                motivo = $5
          WHERE id = $1 AND estado = 'BORRADOR'
          RETURNING ${CAMPOS}`,
        [regla.id, regla.publicadaPorId, regla.publicadaEn, regla.vigenteDesde, regla.motivo],
      );

      fila = resultado.rows[0];
    } catch (error) {
      throw traducirError(error);
    }

    if (!fila) {
      const existente = await this.buscarPorId(regla.id, ejecutor);

      if (!existente) {
        throw new ErrorDeDominio('NO_ENCONTRADO', 'La regla no existe.');
      }

      throw new ErrorDeDominio(
        'VERSION_YA_PUBLICADA',
        'La regla ya está publicada; publique una versión nueva.',
      );
    }

    return mapearRegla(fila);
  }

  async verificarDisponibilidad() {
    try {
      await this.#baseDeDatos.query('SELECT 1 FROM reglas_multiplicador LIMIT 1');
      return true;
    } catch {
      return false;
    }
  }

  #ejecutor(ejecutor) {
    return ejecutor ?? this.#baseDeDatos;
  }
}

function mapearRegla(fila) {
  return new ReglaDeMultiplicador({
    id: fila.id,
    estado: fila.estado,
    version: fila.version,
    formula: fila.formula,
    umbralInferior: fila.umbral_inferior,
    umbralSuperior: fila.umbral_superior,
    multiplicadorMinimo: fila.multiplicador_minimo,
    multiplicadorMaximo: fila.multiplicador_maximo,
    escalaMultiplicador: fila.escala_multiplicador,
    vigenteDesde: fila.vigente_desde,
    motivo: fila.motivo,
    publicadaPorId: fila.publicada_por_id,
    publicadaEn: fila.publicada_en,
    creadaEn: fila.creada_en,
  });
}

function traducirError(error) {
  if (error?.code === VIOLACION_DE_RESTRICCION) {
    if (/inmutable|publicada/i.test(error.message)) {
      return new ErrorDeDominio(
        'VERSION_YA_PUBLICADA',
        'La regla ya está publicada; publique una versión nueva.',
      );
    }

    return new ErrorDeDominio('DATOS_INVALIDOS', 'Los datos de la regla no son válidos.');
  }

  return error;
}
