import { Cotizacion } from '../../../../domain/entities/cotizacion.js';
import { ErrorDeDominio } from '../../../../domain/errors/error-de-dominio.js';
import { PuntoGeografico } from '../../../../domain/value-objects/punto-geografico.js';

const CAMPOS = `
  id, pasajero_id, origen_lat, origen_lng, destino_lat, destino_lng,
  distancia_estimada_m, tiempo_estimado_s, zona_id, solicitudes_usadas,
  choferes_disponibles_usados, regla_id, regla_version, tarifa_id,
  tarifa_version, multiplicador, precio_centavos, parametros_conteo,
  calculada_en, vence_en, estado
`;
const VIOLACION_DE_RESTRICCION = '23514';

/** Adaptador real del puerto RepositorioCotizaciones sobre PostgreSQL. */
export class PostgresCotizacionRepository {
  #baseDeDatos;

  constructor({ baseDeDatos }) {
    this.#baseDeDatos = baseDeDatos;
  }

  async crear(cotizacion, ejecutor) {
    await this.#ejecutor(ejecutor).query(
      `INSERT INTO cotizaciones (
         id, pasajero_id, origen_lat, origen_lng, destino_lat, destino_lng,
         distancia_estimada_m, tiempo_estimado_s, zona_id, solicitudes_usadas,
         choferes_disponibles_usados, regla_id, regla_version, tarifa_id,
         tarifa_version, multiplicador, precio_centavos, parametros_conteo,
         calculada_en, vence_en, estado
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
         $16, $17, $18, $19, $20, $21
       )`,
      [
        cotizacion.id,
        cotizacion.pasajeroId,
        cotizacion.origen.lat,
        cotizacion.origen.lng,
        cotizacion.destino.lat,
        cotizacion.destino.lng,
        cotizacion.distanciaEstimadaM,
        cotizacion.tiempoEstimadoS,
        cotizacion.zonaId,
        cotizacion.solicitudesUsadas,
        cotizacion.choferesDisponiblesUsados,
        cotizacion.reglaId,
        cotizacion.reglaVersion,
        cotizacion.tarifaId,
        cotizacion.tarifaVersion,
        cotizacion.multiplicador,
        cotizacion.precioCentavos,
        JSON.stringify(cotizacion.parametrosConteo),
        cotizacion.calculadaEn,
        cotizacion.venceEn,
        cotizacion.estado,
      ],
    );

    return cotizacion;
  }

  async buscarPorId(id, ejecutor) {
    const { rows } = await this.#ejecutor(ejecutor).query(
      `SELECT ${CAMPOS} FROM cotizaciones WHERE id = $1`,
      [id],
    );

    return rows[0] ? mapearCotizacion(rows[0]) : null;
  }

  /** Bloquea la fila hasta el fin de la transacción (SELECT ... FOR UPDATE). */
  async buscarPorIdParaActualizar(id, ejecutor) {
    const { rows } = await this.#ejecutor(ejecutor).query(
      `SELECT ${CAMPOS} FROM cotizaciones WHERE id = $1 FOR UPDATE`,
      [id],
    );

    return rows[0] ? mapearCotizacion(rows[0]) : null;
  }

  async ultimaPorZona(zonaId, ejecutor) {
    const { rows } = await this.#ejecutor(ejecutor).query(
      `SELECT ${CAMPOS}
         FROM cotizaciones
        WHERE zona_id = $1
        ORDER BY calculada_en DESC, id DESC
        LIMIT 1`,
      [zonaId],
    );

    return rows[0] ? mapearCotizacion(rows[0]) : null;
  }

  async listarPorPasajero(pasajeroId, ejecutor) {
    const { rows } = await this.#ejecutor(ejecutor).query(
      `SELECT ${CAMPOS}
         FROM cotizaciones
        WHERE pasajero_id = $1
        ORDER BY calculada_en DESC, id DESC`,
      [pasajeroId],
    );

    return rows.map(mapearCotizacion);
  }

  async marcarEstado(id, estado, ahora, ejecutor) {
    try {
      const resultado = await this.#ejecutor(ejecutor).query(
        `UPDATE cotizaciones
            SET estado = $2
          WHERE id = $1
            AND estado = 'VIGENTE'
            AND vence_en > $3`,
        [id, estado, ahora],
      );

      return resultado.rowCount > 0;
    } catch (error) {
      if (error?.code === VIOLACION_DE_RESTRICCION) {
        throw new ErrorDeDominio('TRANSICION_INVALIDA', 'La cotización ya no está vigente.');
      }

      throw error;
    }
  }

  async verificarDisponibilidad() {
    try {
      await this.#baseDeDatos.query('SELECT 1 FROM cotizaciones LIMIT 1');
      return true;
    } catch {
      return false;
    }
  }

  #ejecutor(ejecutor) {
    return ejecutor ?? this.#baseDeDatos;
  }
}

function mapearCotizacion(fila) {
  return new Cotizacion({
    id: fila.id,
    pasajeroId: fila.pasajero_id,
    origen: new PuntoGeografico({ lat: Number(fila.origen_lat), lng: Number(fila.origen_lng) }),
    destino: new PuntoGeografico({ lat: Number(fila.destino_lat), lng: Number(fila.destino_lng) }),
    distanciaEstimadaM: fila.distancia_estimada_m,
    tiempoEstimadoS: fila.tiempo_estimado_s,
    zonaId: fila.zona_id,
    solicitudesUsadas: fila.solicitudes_usadas,
    choferesDisponiblesUsados: fila.choferes_disponibles_usados,
    reglaId: fila.regla_id,
    reglaVersion: fila.regla_version,
    tarifaId: fila.tarifa_id,
    tarifaVersion: fila.tarifa_version,
    multiplicador: fila.multiplicador,
    precioCentavos: fila.precio_centavos,
    parametrosConteo: fila.parametros_conteo,
    calculadaEn: fila.calculada_en,
    venceEn: fila.vence_en,
    estado: fila.estado,
  });
}
