/**
 * Puerto de salida: repositorio del agregado Chofer.
 *
 * Contrato:
 *   crear(chofer, ejecutor?): Promise<void>
 *   buscarPorUsuarioId(usuarioId, ejecutor?): Promise<Chofer | null>
 *   buscarPorUsuarioIdParaActualizar(usuarioId, ejecutor?): Promise<Chofer | null>
 *   actualizar(chofer, ejecutor?): Promise<void>
 *   verificarDisponibilidad(): Promise<boolean>
 *
 * `buscarPorUsuarioIdParaActualizar` bloquea la fila del chofer. La aceptación
 * de un viaje toma primero el viaje y después el chofer, en ese orden global.
 *
 * Adaptadores:
 * - real:  src/infrastructure/adapters/out/persistence/postgres-chofer-repository.js
 * - falso: src/infrastructure/adapters/out/persistence/in-memory-chofer-repository.js
 */
export {};
