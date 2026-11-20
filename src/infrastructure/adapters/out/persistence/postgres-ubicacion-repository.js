import { UbicacionChofer } from '../../../../domain/entities/ubicacion-chofer.js';

/**
 * Adaptador real del puerto RepositorioUbicaciones sobre PostgreSQL + PostGIS.
 *
 * Ojo con el orden: ST_MakePoint recibe (longitud, latitud), es decir (x, y).
 * Al leer, ST_X devuelve la longitud y ST_Y la latitud.
 */
export class PostgresUbicacionRepository {
  #baseDeDatos;

  constructor({ baseDeDatos }) {
    this.#baseDeDatos = baseDeDatos;
  }

  async guardar(ubicacion, ejecutor) {
    // Upsert por chofer. El WHERE evita que un envío atrasado pise uno nuevo.
    await this.#ejecutor(ejecutor).query(
      `INSERT INTO ubicaciones_vigentes (chofer_id, posicion, actualizada_en)
       VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, $4)
       ON CONFLICT (chofer_id) DO UPDATE
          SET posicion = EXCLUDED.posicion,
              actualizada_en = EXCLUDED.actualizada_en
        WHERE ubicaciones_vigentes.actualizada_en <= EXCLUDED.actualizada_en`,
      [ubicacion.choferId, ubicacion.punto.lng, ubicacion.punto.lat, ubicacion.actualizadaEn],
    );
  }

  async buscarPorChoferId(choferId, ejecutor) {
    const { rows } = await this.#ejecutor(ejecutor).query(
      `SELECT chofer_id,
              ST_Y(posicion::geometry) AS lat,
              ST_X(posicion::geometry) AS lng,
              actualizada_en
         FROM ubicaciones_vigentes
        WHERE chofer_id = $1`,
      [choferId],
    );

    return rows[0] ? mapearUbicacion(rows[0]) : null;
  }

  async listar(ejecutor) {
    const { rows } = await this.#ejecutor(ejecutor).query(
      `SELECT chofer_id,
              ST_Y(posicion::geometry) AS lat,
              ST_X(posicion::geometry) AS lng,
              actualizada_en
         FROM ubicaciones_vigentes`,
    );

    return rows.map(mapearUbicacion);
  }

  async verificarDisponibilidad() {
    try {
      await this.#baseDeDatos.query('SELECT 1 FROM ubicaciones_vigentes LIMIT 1');
      return true;
    } catch {
      return false;
    }
  }

  #ejecutor(ejecutor) {
    return ejecutor ?? this.#baseDeDatos;
  }
}

function mapearUbicacion(fila) {
  return new UbicacionChofer({
    choferId: fila.chofer_id,
    punto: { lat: fila.lat, lng: fila.lng },
    actualizadaEn: fila.actualizada_en,
  });
}
