import { Tarifa } from '../../../../domain/entities/tarifa.js';
import { ErrorDeDominio } from '../../../../domain/errors/error-de-dominio.js';

const CAMPOS = `
  id, estado, version, base_centavos, por_km_centavos, por_minuto_centavos,
  precio_maximo_centavos, vigente_desde, publicada_por_id, publicada_en, creada_en
`;
const VIOLACION_DE_RESTRICCION = '23514';

/** Adaptador real del puerto RepositorioTarifas sobre PostgreSQL. */
export class PostgresTarifaRepository {
  #baseDeDatos;

  constructor({ baseDeDatos }) {
    this.#baseDeDatos = baseDeDatos;
  }

  async crear(tarifa, ejecutor) {
    await this.#ejecutor(ejecutor).query(
      `INSERT INTO tarifas (
         id, estado, base_centavos, por_km_centavos, por_minuto_centavos,
         precio_maximo_centavos, creada_en
       ) VALUES ($1, 'BORRADOR', $2, $3, $4, $5, $6)`,
      [
        tarifa.id,
        tarifa.baseCentavos,
        tarifa.porKmCentavos,
        tarifa.porMinutoCentavos,
        tarifa.precioMaximoCentavos,
        tarifa.creadaEn,
      ],
    );

    return tarifa;
  }

  async buscarPorId(id, ejecutor) {
    const { rows } = await this.#ejecutor(ejecutor).query(
      `SELECT ${CAMPOS} FROM tarifas WHERE id = $1`,
      [id],
    );

    return rows[0] ? mapearTarifa(rows[0]) : null;
  }

  async actualizar(tarifa, ejecutor) {
    try {
      const resultado = await this.#ejecutor(ejecutor).query(
        `UPDATE tarifas
            SET base_centavos = $2,
                por_km_centavos = $3,
                por_minuto_centavos = $4,
                precio_maximo_centavos = $5
          WHERE id = $1 AND estado = 'BORRADOR'`,
        [
          tarifa.id,
          tarifa.baseCentavos,
          tarifa.porKmCentavos,
          tarifa.porMinutoCentavos,
          tarifa.precioMaximoCentavos,
        ],
      );

      if (resultado.rowCount === 0) {
        const existente = await this.buscarPorId(tarifa.id, ejecutor);

        if (!existente) throw new ErrorDeDominio('NO_ENCONTRADO', 'La tarifa no existe.');

        throw new ErrorDeDominio(
          'VERSION_YA_PUBLICADA',
          'La tarifa ya está publicada; publique una versión nueva.',
        );
      }
    } catch (error) {
      if (error instanceof ErrorDeDominio) throw error;
      throw traducirError(error);
    }

    return tarifa;
  }

  async listar(ejecutor) {
    const { rows } = await this.#ejecutor(ejecutor).query(
      `SELECT ${CAMPOS} FROM tarifas ORDER BY creada_en DESC, id ASC`,
    );

    return rows.map(mapearTarifa);
  }

  async vigente(ahora, ejecutor) {
    const { rows } = await this.#ejecutor(ejecutor).query(
      `SELECT ${CAMPOS}
         FROM tarifas
        WHERE estado = 'PUBLICADA'
          AND vigente_desde <= $1
        ORDER BY version DESC
        LIMIT 1`,
      [ahora],
    );

    return rows[0] ? mapearTarifa(rows[0]) : null;
  }

  async publicar(tarifa, ejecutor) {
    let fila;

    try {
      const resultado = await this.#ejecutor(ejecutor).query(
        `UPDATE tarifas
            SET estado = 'PUBLICADA',
                publicada_por_id = $2,
                publicada_en = $3,
                vigente_desde = $4
          WHERE id = $1 AND estado = 'BORRADOR'
          RETURNING ${CAMPOS}`,
        [tarifa.id, tarifa.publicadaPorId, tarifa.publicadaEn, tarifa.vigenteDesde],
      );

      fila = resultado.rows[0];
    } catch (error) {
      throw traducirError(error);
    }

    if (!fila) {
      const existente = await this.buscarPorId(tarifa.id, ejecutor);

      if (!existente) {
        throw new ErrorDeDominio('NO_ENCONTRADO', 'La tarifa no existe.');
      }

      throw new ErrorDeDominio(
        'VERSION_YA_PUBLICADA',
        'La tarifa ya está publicada; publique una versión nueva.',
      );
    }

    return mapearTarifa(fila);
  }

  async verificarDisponibilidad() {
    try {
      await this.#baseDeDatos.query('SELECT 1 FROM tarifas LIMIT 1');
      return true;
    } catch {
      return false;
    }
  }

  #ejecutor(ejecutor) {
    return ejecutor ?? this.#baseDeDatos;
  }
}

function mapearTarifa(fila) {
  return new Tarifa({
    id: fila.id,
    estado: fila.estado,
    version: fila.version,
    baseCentavos: fila.base_centavos,
    porKmCentavos: fila.por_km_centavos,
    porMinutoCentavos: fila.por_minuto_centavos,
    precioMaximoCentavos: fila.precio_maximo_centavos,
    vigenteDesde: fila.vigente_desde,
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
        'La tarifa ya está publicada; publique una versión nueva.',
      );
    }

    return new ErrorDeDominio('DATOS_INVALIDOS', 'Los datos de la tarifa no son válidos.');
  }

  return error;
}
