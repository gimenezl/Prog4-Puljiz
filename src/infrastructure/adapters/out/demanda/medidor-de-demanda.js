import { puntoDentroDePoligono } from '../geografia/poligono.js';

/**
 * Medidor de demanda compartido por los dos juegos de adaptadores.
 *
 * Lee los repositorios ya cableados en el composition root: la diferencia
 * entre PostgreSQL y memoria está en esos repositorios, no en el conteo.
 * Todo lo que se usa para contar se guarda en `parametros` dentro de la
 * cotización, de modo que el resultado sea reproducible.
 */
export class MedidorDeDemanda {
  #repositorioViajes;
  #repositorioChoferes;
  #repositorioUbicaciones;
  #ventanaMs;
  #ubicacionVigenciaMs;

  constructor({
    repositorioViajes,
    repositorioChoferes,
    repositorioUbicaciones,
    ventanaMs,
    ubicacionVigenciaMs,
  }) {
    this.#repositorioViajes = repositorioViajes;
    this.#repositorioChoferes = repositorioChoferes;
    this.#repositorioUbicaciones = repositorioUbicaciones;
    this.#ventanaMs = ventanaMs;
    this.#ubicacionVigenciaMs = ubicacionVigenciaMs;
  }

  async medir(zona, ahora) {
    const desde = new Date(ahora.getTime() - this.#ventanaMs);
    const [viajes, choferes, ubicaciones] = await Promise.all([
      this.#repositorioViajes.listarActivosDesde(desde),
      this.#repositorioChoferes.listarElegibles(),
      this.#repositorioUbicaciones.listar(),
    ]);

    const puntos = zona.criterio.puntos;
    const solicitudes = viajes.filter((viaje) =>
      puntoDentroDePoligono(viaje.origen.aJSON(), puntos),
    ).length;

    const porChofer = new Map(ubicaciones.map((ubicacion) => [ubicacion.choferId, ubicacion]));
    const choferesDisponibles = choferes.filter((chofer) => {
      const ubicacion = porChofer.get(chofer.usuarioId);

      return (
        ubicacion &&
        ubicacion.estaVigente(ahora, this.#ubicacionVigenciaMs) &&
        puntoDentroDePoligono(ubicacion.punto.aJSON(), puntos)
      );
    }).length;

    return {
      solicitudes,
      choferesDisponibles,
      parametros: {
        zonaId: zona.id,
        calculadaEn: ahora.toISOString(),
        ventanaMs: this.#ventanaMs,
        desde: desde.toISOString(),
        ubicacionVigenciaMs: this.#ubicacionVigenciaMs,
        estadosSolicitudes: ['SOLICITADO', 'ASIGNADO', 'CHOFER_EN_CAMINO', 'EN_CURSO'],
      },
    };
  }
}

export const MedidorDeDemandaEnMemoria = MedidorDeDemanda;
export const MedidorDeDemandaPostgres = MedidorDeDemanda;
