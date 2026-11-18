/**
 * Adaptador falso del puerto SimuladorDeCobro.
 *
 * Registra cada ejecución para que los tests puedan comprobar que el efecto se
 * ejecutó una sola vez. La referencia también es determinista por viaje.
 */
export class SimuladorDeCobroEnMemoria {
  #llamadas = [];

  async cobrar({ viajeId, montoCentavos }) {
    this.#llamadas.push({ viajeId, montoCentavos });

    return {
      viajeId,
      montoCentavos,
      referencia: `SIM-${viajeId}`,
    };
  }

  get llamadas() {
    return this.#llamadas.map((llamada) => ({ ...llamada }));
  }

  get cantidadLlamadas() {
    return this.#llamadas.length;
  }
}
