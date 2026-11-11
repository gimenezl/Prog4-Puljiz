/**
 * Puerto de salida: UnidadDeTrabajo.
 *
 * Contrato:
 *   ejecutar(operacion): Promise<T>
 *
 * Ejecuta varias escrituras como una sola operación atómica: o se aplican
 * todas o no se aplica ninguna. La operación recibe un contexto opaco que debe
 * pasarse a cada método de repositorio para que use la misma transacción.
 *
 * Ejemplo:
 *
 *   unidadDeTrabajo.ejecutar(async (tx) => {
 *     const viaje = await repositorioViajes.buscarPorIdParaActualizar(id, tx);
 *     await repositorioViajes.actualizar(viaje, tx);
 *   });
 *
 * Adaptadores:
 * - real:  src/infrastructure/adapters/out/persistence/postgres-unit-of-work.js
 * - falso: src/infrastructure/adapters/out/persistence/in-memory-unit-of-work.js
 */
export {};
