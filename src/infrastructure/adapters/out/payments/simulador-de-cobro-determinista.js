/**
 * Adaptador real del puerto SimuladorDeCobro.
 *
 * No mueve dinero: genera una referencia determinista a partir del viaje. Al
 * ser determinista, un reintento del mismo viaje produce la misma referencia y
 * el efecto externo sigue siendo idempotente por la clave natural `viajeId`.
 */
export class SimuladorDeCobroDeterminista {
  async cobrar({ viajeId, montoCentavos }) {
    return {
      viajeId,
      montoCentavos,
      referencia: `SIM-${viajeId}`,
    };
  }
}
