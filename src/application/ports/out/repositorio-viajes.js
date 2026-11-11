/**
 * Puerto de salida: repositorio del agregado Viaje.
 *
 * Contrato:
 *   crear(viaje, ejecutor?): Promise<void>
 *   buscarPorId(id, ejecutor?): Promise<Viaje | null>
 *   buscarPorIdParaActualizar(id, ejecutor?): Promise<Viaje | null>
 *   actualizar(viaje, ejecutor?): Promise<void>
 *   listarSolicitados(limite, ejecutor?): Promise<Viaje[]>
 *   verificarDisponibilidad(): Promise<boolean>
 *
 * `buscarPorIdParaActualizar` debe bloquear la fila del viaje hasta que termine
 * la unidad de trabajo. Esa fila es el punto de serialización de aceptaciones y
 * cancelaciones concurrentes.
 *
 * Adaptadores:
 * - real:  src/infrastructure/adapters/out/persistence/postgres-viaje-repository.js
 * - falso: src/infrastructure/adapters/out/persistence/in-memory-viaje-repository.js
 */
export {};
