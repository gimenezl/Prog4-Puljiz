/**
 * Consulta de choferes cercanos. Se exporta para que la medición de RF-06
 * (scripts/medir-busqueda.js) haga EXPLAIN exactamente sobre esta sentencia.
 *
 * Parámetros: $1 longitud, $2 latitud, $3 ubicación mínima vigente, $4 radio
 * en metros, $5 límite.
 *
 * Por qué la elegibilidad es una subconsulta escalar y no un JOIN: PostGIS
 * subestima cuántas filas deja pasar ST_DWithin (estima 1 cuando son cientos).
 * Con un JOIN (o con IN, que el planificador convierte en join), en muchos
 * puntos de la ciudad elegía recorrer todos los choferes contra todas las
 * ubicaciones cercanas: cuadrático (~300 ms con 5000 choferes). Una subconsulta
 * escalar nunca se convierte en join: se evalúa una vez por cada ubicación
 * dentro del radio, buscando al chofer por su clave primaria. El costo queda
 * lineal en los vecinos, sea cual sea la estimación. Ver docs/mediciones.md.
 */
export const CONSULTA_CHOFERES_CERCANOS = `
  WITH origen AS (
    SELECT ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography AS punto
  )
  SELECT u.chofer_id,
         ROUND(ST_Distance(u.posicion, origen.punto))::integer AS distancia_m
    FROM ubicaciones_vigentes u
    CROSS JOIN origen
   WHERE u.actualizada_en > $3
     AND ST_DWithin(u.posicion, origen.punto, $4)
     AND (
       SELECT c.habilitado AND c.disponible AND c.viaje_activo_id IS NULL
         FROM choferes c
        WHERE c.usuario_id = u.chofer_id
     )
   ORDER BY u.posicion <-> origen.punto, u.chofer_id
   LIMIT $5`;

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

    const { rows } = await (ejecutor ?? this.#baseDeDatos).query(CONSULTA_CHOFERES_CERCANOS, [
      origen.lng,
      origen.lat,
      minimaActualizacion,
      radioM,
      limite,
    ]);

    return rows.map((fila) => ({ choferId: fila.chofer_id, distanciaM: fila.distancia_m }));
  }
}
