import { Vehiculo } from '../../../../domain/entities/vehiculo.js';
import { ErrorDeDominio } from '../../../../domain/errors/error-de-dominio.js';

const VIOLACION_DE_UNICIDAD = '23505';

/**
 * Adaptador real del puerto RepositorioVehiculos sobre PostgreSQL.
 *
 * `guardar` es un upsert por chofer: si el chofer ya tiene vehículo, reemplaza
 * sus datos y conserva el id. La unicidad de la patente la decide la base; el
 * adaptador traduce esa violación a un error del dominio.
 */
export class PostgresVehiculoRepository {
  #baseDeDatos;

  constructor({ baseDeDatos }) {
    this.#baseDeDatos = baseDeDatos;
  }

  async guardar(vehiculo, ejecutor) {
    try {
      await this.#ejecutor(ejecutor).query(
        `INSERT INTO vehiculos (id, chofer_id, patente, marca, modelo, anio, color)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (chofer_id) DO UPDATE
            SET patente = EXCLUDED.patente,
                marca = EXCLUDED.marca,
                modelo = EXCLUDED.modelo,
                anio = EXCLUDED.anio,
                color = EXCLUDED.color`,
        [
          vehiculo.id,
          vehiculo.choferId,
          vehiculo.patente,
          vehiculo.marca,
          vehiculo.modelo,
          vehiculo.anio,
          vehiculo.color,
        ],
      );
    } catch (error) {
      if (
        error?.code === VIOLACION_DE_UNICIDAD &&
        error?.constraint === 'vehiculos_patente_unica'
      ) {
        throw new ErrorDeDominio(
          'PATENTE_YA_REGISTRADA',
          'La patente ya está registrada en otro vehículo.',
        );
      }

      throw error;
    }
  }

  async buscarPorChoferId(choferId, ejecutor) {
    const { rows } = await this.#ejecutor(ejecutor).query(
      `SELECT id, chofer_id, patente, marca, modelo, anio, color
         FROM vehiculos
        WHERE chofer_id = $1`,
      [choferId],
    );

    return rows[0] ? mapearVehiculo(rows[0]) : null;
  }

  async verificarDisponibilidad() {
    try {
      await this.#baseDeDatos.query('SELECT 1 FROM vehiculos LIMIT 1');
      return true;
    } catch {
      return false;
    }
  }

  #ejecutor(ejecutor) {
    return ejecutor ?? this.#baseDeDatos;
  }
}

function mapearVehiculo(fila) {
  return new Vehiculo({
    id: fila.id,
    choferId: fila.chofer_id,
    patente: fila.patente,
    marca: fila.marca,
    modelo: fila.modelo,
    anio: fila.anio,
    color: fila.color,
  });
}
