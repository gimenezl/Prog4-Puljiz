import { ZonaDeDemanda, validarCriterio } from '../../../../domain/entities/zona-de-demanda.js';
import { ErrorDeDominio } from '../../../../domain/errors/error-de-dominio.js';
import { criterioAWkt } from '../geografia/poligono.js';

const VIOLACION_DE_RESTRICCION = '23514';
const VIOLACION_DE_UNICIDAD = '23505';

/**
 * Adaptador real del puerto RepositorioZonas sobre PostgreSQL + PostGIS.
 *
 * El polígono se guarda como geography y se consulta con ST_Covers. Los
 * mensajes de los triggers se traducen a errores del dominio para que la capa
 * HTTP no exponga detalles de PostgreSQL.
 */
export class PostgresZonaRepository {
  #baseDeDatos;

  constructor({ baseDeDatos }) {
    this.#baseDeDatos = baseDeDatos;
  }

  async crear(zona, ejecutor) {
    try {
      await this.#ejecutor(ejecutor).query(
        `INSERT INTO zonas_de_demanda (id, nombre, area, activa, creada_en)
         VALUES ($1, $2, ST_GeographyFromText($3), $4, $5)`,
        [zona.id, zona.nombre, criterioAWkt(zona.criterio), zona.activa, zona.creadaEn],
      );
    } catch (error) {
      throw traducirError(error);
    }

    return zona;
  }

  async buscarPorId(id, ejecutor) {
    const { rows } = await this.#ejecutor(ejecutor).query(`${SELECT_CAMPOS} WHERE id = $1`, [id]);

    return rows[0] ? mapearZona(rows[0]) : null;
  }

  async zonaDe(punto, _ahora, ejecutor) {
    const { rows } = await this.#ejecutor(ejecutor).query(
      `${SELECT_CAMPOS}
        WHERE activa
          AND ST_Covers(area, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography)
        ORDER BY nombre ASC
        LIMIT 1`,
      [punto.lng, punto.lat],
    );

    return rows[0] ? mapearZona(rows[0]) : null;
  }

  async listar({ activa } = {}, ejecutor) {
    const condiciones = [];
    const parametros = [];

    if (activa !== undefined) {
      parametros.push(activa);
      condiciones.push(`activa = $${parametros.length}`);
    }

    const where = condiciones.length > 0 ? ` WHERE ${condiciones.join(' AND ')}` : '';
    const { rows } = await this.#ejecutor(ejecutor).query(
      `${SELECT_CAMPOS}${where} ORDER BY nombre ASC`,
      parametros,
    );

    return rows.map(mapearZona);
  }

  async actualizar(zona, ejecutor) {
    try {
      const resultado = await this.#ejecutor(ejecutor).query(
        `UPDATE zonas_de_demanda
            SET nombre = $2,
                area = ST_GeographyFromText($3),
                activa = $4
          WHERE id = $1`,
        [zona.id, zona.nombre, criterioAWkt(zona.criterio), zona.activa],
      );

      if (resultado.rowCount === 0) {
        throw new ErrorDeDominio('NO_ENCONTRADO', 'La zona no existe.');
      }
    } catch (error) {
      if (error instanceof ErrorDeDominio) throw error;
      throw traducirError(error);
    }

    return zona;
  }

  async verificarDisponibilidad() {
    try {
      await this.#baseDeDatos.query('SELECT 1 FROM zonas_de_demanda LIMIT 1');
      return true;
    } catch {
      return false;
    }
  }

  #ejecutor(ejecutor) {
    return ejecutor ?? this.#baseDeDatos;
  }
}

const SELECT_CAMPOS = `
  SELECT id,
         nombre,
         ST_AsGeoJSON(area::geometry) AS area_geojson,
         activa,
         creada_en
    FROM zonas_de_demanda
`;

function mapearZona(fila) {
  const geojson =
    typeof fila.area_geojson === 'string' ? JSON.parse(fila.area_geojson) : fila.area_geojson;
  const puntos = geojson.coordinates[0].map(([lng, lat]) => ({ lat, lng }));

  return new ZonaDeDemanda({
    id: fila.id,
    nombre: fila.nombre,
    criterio: validarCriterio({ tipo: 'POLIGONO', puntos }),
    activa: fila.activa,
    creadaEn: fila.creada_en,
  });
}

function traducirError(error) {
  if (error?.code === VIOLACION_DE_UNICIDAD) {
    return new ErrorDeDominio('NOMBRE_YA_REGISTRADO', 'El nombre de la zona ya está registrado.');
  }

  if (error?.code === VIOLACION_DE_RESTRICCION) {
    if (/solapa/i.test(error.message)) {
      return new ErrorDeDominio('ZONAS_SUPERPUESTAS', 'La zona se solapa con otra zona activa.');
    }

    return new ErrorDeDominio('DATOS_INVALIDOS', 'Los datos de la zona no son válidos.');
  }

  return error;
}
