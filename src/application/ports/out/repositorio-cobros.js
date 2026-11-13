/**
 * Puerto de salida: repositorio de cobros simulados.
 *
 * Contrato:
 *   crear(cobro, ejecutor?): Promise<boolean>
 *   buscarPorViajeId(viajeId, ejecutor?): Promise<CobroSimulado | null>
 *   buscarPorViajeIdParaActualizar(viajeId, ejecutor?): Promise<CobroSimulado | null>
 *   actualizar(cobro, ejecutor?): Promise<void>
 *   verificarDisponibilidad(): Promise<boolean>
 *
 * `viajeId` es la clave natural y única del cobro: un viaje tiene como máximo
 * un `CobroSimulado`. `crear` devuelve false si ya existe uno para ese viaje.
 * `buscarPorViajeIdParaActualizar` bloquea la fila para que dos reintentos
 * simultáneos no ejecuten el cobro dos veces.
 *
 * Adaptadores:
 * - real:  src/infrastructure/adapters/out/persistence/postgres-cobro-repository.js
 * - falso: src/infrastructure/adapters/out/persistence/in-memory-cobro-repository.js
 */
export {};
