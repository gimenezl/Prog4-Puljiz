/**
 * Puerto de salida: MedidorDeDemanda.
 *
 * Contrato:
 *   medir(zona, ahora): Promise<{
 *     solicitudes: number,
 *     choferesDisponibles: number,
 *     parametros: object
 *   }>
 *
 * Cuenta las solicitudes activas de la zona y los choferes disponibles dentro
 * de ella. La ventana de conteo la fija la configuración; el resultado se guarda
 * en la cotización para que el cálculo sea reproducible.
 *
 * Adaptadores:
 * - real:  src/infrastructure/adapters/out/demanda/medidor-de-demanda-postgres.js
 * - falso: src/infrastructure/adapters/out/demanda/medidor-de-demanda-en-memoria.js
 */
export {};
