/**
 * Puerto de salida: SimuladorDeCobro.
 *
 * Contrato:
 *   cobrar({ viajeId, monto, referencia }): Promise<ResultadoCobro>
 *
 * Ejecuta el cobro simulado una sola vez por viaje. El adaptador real
 * debe aplicar timeout y ser idempotente por la clave natural del viaje.
 */
export {};
