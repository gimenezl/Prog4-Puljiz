import { Viaje } from '../../../../domain/entities/viaje.js';
import { ErrorDeDominio } from '../../../../domain/errors/error-de-dominio.js';
import { PuntoGeografico } from '../../../../domain/value-objects/punto-geografico.js';

const CAMPOS = `
  id, pasajero_id, origen_lat, origen_lng, destino_lat, destino_lng,
  distancia_estimada_m, precio_fijado_centavos, chofer_id, estado,
  solicitado_en, asignado_en, cerrado_en, cancelado_por_id, motivo_cancelacion
`;

/**
 * Adaptador real del puerto RepositorioViajes sobre PostgreSQL.
 *
 * `buscarPorIdParaActualizar` usa SELECT ... FOR UPDATE: es el punto de
 * serialización de aceptaciones y cancelaciones concurrentes del mismo viaje.
 */
export class PostgresViajeRepository {
  #baseDeDatos;

  constructor({ baseDeDatos }) {
    this.#baseDeDatos = baseDeDatos;
  }

  async crear(viaje, ejecutor) {
    await this.#ejecutor(ejecutor).query(
      `INSERT INTO viajes (
         id, pasajero_id, origen_lat, origen_lng, destino_lat, destino_lng,
         distancia_estimada_m, precio_fijado_centavos, chofer_id, estado,
         solicitado_en, asignado_en, cerrado_en, cancelado_por_id, motivo_cancelacion
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
       )`,
      [
        viaje.id,
        viaje.pasajeroId,
        viaje.origen.lat,
        viaje.origen.lng,
        viaje.destino.lat,
        viaje.destino.lng,
        viaje.distanciaEstimadaM,
        viaje.precioFijadoCentavos,
        viaje.choferId,
        viaje.estado,
        viaje.solicitadoEn,
        viaje.asignadoEn,
        viaje.cerradoEn,
        viaje.canceladoPorId,
        viaje.motivoCancelacion,
      ],
    );
  }

  async buscarPorId(id, ejecutor) {
    const { rows } = await this.#ejecutor(ejecutor).query(
      `SELECT ${CAMPOS} FROM viajes WHERE id = $1`,
      [id],
    );

    return rows[0] ? mapearViaje(rows[0]) : null;
  }

  async buscarPorIdParaActualizar(id, ejecutor) {
    const { rows } = await this.#ejecutor(ejecutor).query(
      `SELECT ${CAMPOS} FROM viajes WHERE id = $1 FOR UPDATE`,
      [id],
    );

    return rows[0] ? mapearViaje(rows[0]) : null;
  }

  async actualizar(viaje, ejecutor) {
    const resultado = await this.#ejecutor(ejecutor).query(
      `UPDATE viajes
          SET chofer_id = $2,
              estado = $3,
              asignado_en = $4,
              cerrado_en = $5,
              cancelado_por_id = $6,
              motivo_cancelacion = $7
        WHERE id = $1`,
      [
        viaje.id,
        viaje.choferId,
        viaje.estado,
        viaje.asignadoEn,
        viaje.cerradoEn,
        viaje.canceladoPorId,
        viaje.motivoCancelacion,
      ],
    );

    if (resultado.rowCount === 0) {
      throw new ErrorDeDominio('NO_ENCONTRADO', 'El viaje no existe.');
    }
  }

  async listarSolicitados(limite = 50, ejecutor) {
    const { rows } = await this.#ejecutor(ejecutor).query(
      `SELECT ${CAMPOS}
         FROM viajes
        WHERE estado = 'SOLICITADO'
        ORDER BY solicitado_en ASC, id ASC
        LIMIT $1`,
      [limite],
    );

    return rows.map(mapearViaje);
  }

  async verificarDisponibilidad() {
    try {
      await this.#baseDeDatos.query('SELECT 1 FROM viajes LIMIT 1');
      return true;
    } catch {
      return false;
    }
  }

  #ejecutor(ejecutor) {
    return ejecutor ?? this.#baseDeDatos;
  }
}

function mapearViaje(fila) {
  return new Viaje({
    id: fila.id,
    pasajeroId: fila.pasajero_id,
    origen: new PuntoGeografico({
      lat: Number(fila.origen_lat),
      lng: Number(fila.origen_lng),
    }),
    destino: new PuntoGeografico({
      lat: Number(fila.destino_lat),
      lng: Number(fila.destino_lng),
    }),
    distanciaEstimadaM: fila.distancia_estimada_m,
    precioFijadoCentavos: fila.precio_fijado_centavos,
    choferId: fila.chofer_id,
    estado: fila.estado,
    solicitadoEn: fila.solicitado_en,
    asignadoEn: fila.asignado_en,
    cerradoEn: fila.cerrado_en,
    canceladoPorId: fila.cancelado_por_id,
    motivoCancelacion: fila.motivo_cancelacion,
  });
}
