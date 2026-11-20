/**
 * Estimador determinista de recorrido.
 *
 * Usa la distancia Haversine del value object y la velocidad media configurada.
 * No llama a proveedores externos: el servidor calcula siempre distancia y
 * tiempo, y el resultado es estable para las mismas coordenadas.
 */
export class EstimadorDeRecorridoHaversine {
  #velocidadKmh;

  constructor({ velocidadEstimadaKmh = 30 } = {}) {
    if (
      typeof velocidadEstimadaKmh !== 'number' ||
      !Number.isFinite(velocidadEstimadaKmh) ||
      velocidadEstimadaKmh <= 0
    ) {
      throw new Error('La velocidad estimada debe ser un número positivo.');
    }

    this.#velocidadKmh = velocidadEstimadaKmh;
  }

  async estimar(origen, destino, _ahora = null) {
    const distanciaM = Math.max(1, Math.round(origen.distanciaA(destino)));
    const metrosPorSegundo = (this.#velocidadKmh * 1000) / 3600;
    const tiempoS = Math.ceil(distanciaM / metrosPorSegundo);

    return { distanciaM, tiempoS };
  }
}
