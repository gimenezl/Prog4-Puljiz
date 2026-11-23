/**
 * Adaptador real del puerto BuscadorDeChoferesCercanos (ADR-0006).
 *
 * Toda la búsqueda ocurre en PostgreSQL:
 * - ST_DWithin filtra por radio usando el índice GiST de
 *   ubicaciones_vigentes.posicion, sin leer los choferes lejanos;
 * - `<->` ordena por cercanía (vecino más cercano) también con el índice;
 * - LIMIT corta en la base, así que a Node solo llegan los candidatos.
 *
 * ST_MakePoint recibe (longitud, latitud).
 */
export class PostgisBuscadorDeChoferes {
  #baseDeDatos;

  constructor({ baseDeDatos }) {
    this.#baseDeDatos = baseDeDatos;
  }

  async buscar({ origen, radioM, limite, ahora, vigenciaUbicacionMs }, ejecutor) {
    const minimaActualizacion = new Date(ahora.getTime() - vigenciaUbicacionMs);

    const { rows } = await (ejecutor ?? this.#baseDeDatos).query(
      `WITH origen AS (
         SELECT ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography AS punto
       )
       SELECT u.chofer_id,
              ROUND(ST_Distance(u.posicion, origen.punto))::integer AS distancia_m
         FROM ubicaciones_vigentes u
         JOIN choferes c ON c.usuario_id = u.chofer_id
         CROSS JOIN origen
        WHERE c.habilitado
          AND c.disponible
          AND c.viaje_activo_id IS NULL
          AND u.actualizada_en > $3
          AND ST_DWithin(u.posicion, origen.punto, $4)
        ORDER BY u.posicion <-> origen.punto, u.chofer_id
        LIMIT $5`,
      [origen.lng, origen.lat, minimaActualizacion, radioM, limite],
    );

    return rows.map((fila) => ({ choferId: fila.chofer_id, distanciaM: fila.distancia_m }));
  }
}
