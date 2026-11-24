import { PuntoGeografico } from '../../../../domain/value-objects/punto-geografico.js';

/**
 * Adaptador del puerto BuscadorDeChoferesCercanos que filtra en JavaScript.
 *
 * Trae TODOS los choferes elegibles y TODAS las ubicaciones, y calcula la
 * distancia de cada uno con Haversine. Es lineal en la cantidad de choferes
 * (alternativa D del ADR-0006).
 *
 * Se usa:
 * - con los repositorios en memoria (ADAPTERS_MODE=fake), donde no hay base;
 * - como mecanismo de comparación en la medición de RF-06 (scripts/medir-busqueda.js).
 *
 * Con PostgreSQL la aplicación usa PostgisBuscadorDeChoferes.
 */
export class JavaScriptBuscadorDeChoferes {
  #repositorioChoferes;
  #repositorioUbicaciones;

  constructor({ repositorioChoferes, repositorioUbicaciones }) {
    this.#repositorioChoferes = repositorioChoferes;
    this.#repositorioUbicaciones = repositorioUbicaciones;
  }

  async buscar({ origen, radioM, limite, ahora, vigenciaUbicacionMs }, ejecutor) {
    const punto = new PuntoGeografico(origen);
    const [elegibles, ubicaciones] = await Promise.all([
      this.#repositorioChoferes.listarElegibles(ejecutor),
      this.#repositorioUbicaciones.listar(ejecutor),
    ]);
    const ubicacionPorChofer = new Map(ubicaciones.map((u) => [u.choferId, u]));

    const candidatos = [];

    for (const chofer of elegibles) {
      const ubicacion = ubicacionPorChofer.get(chofer.usuarioId);

      if (!ubicacion || !ubicacion.estaVigente(ahora, vigenciaUbicacionMs)) continue;

      const distanciaM = Math.round(punto.distanciaA(ubicacion.punto));

      if (distanciaM <= radioM) {
        candidatos.push({ choferId: chofer.usuarioId, distanciaM });
      }
    }

    return candidatos
      .sort((a, b) => a.distanciaM - b.distanciaM || a.choferId.localeCompare(b.choferId))
      .slice(0, limite);
  }
}
