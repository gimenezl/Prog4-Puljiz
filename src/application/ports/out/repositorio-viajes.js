/**
 * Puerto de salida: repositorio del agregado Viaje.
 *
 * Contrato:
 *   crear(viaje, ejecutor?): Promise<void>
 *   buscarPorId(id, ejecutor?): Promise<Viaje | null>
 *   buscarPorIdParaActualizar(id, ejecutor?): Promise<Viaje | null>
 *   actualizar(viaje, ejecutor?): Promise<void>
 *   listarSolicitados(limite, ejecutor?): Promise<Viaje[]>
 *   listarSolicitadosCerca(punto, radioM, limite, ejecutor?): Promise<{ viaje, distanciaM }[]>
 *   listarPorParticipante(usuarioId, { estados, antesDe, limite }, ejecutor?): Promise<Viaje[]>
 *   listarActivos({ antesDe, limite }, ejecutor?): Promise<Viaje[]>
 *   verificarDisponibilidad(): Promise<boolean>
 *
 * `listarPorParticipante` y `listarActivos` devuelven del más nuevo al más
 * viejo (`solicitadoEn` y después `id`, descendentes). `antesDe` es la posición
 * `{ solicitadoEn, id }` del último viaje de la página anterior (paginación por
 * cursor): solo se devuelven viajes estrictamente anteriores. `estados` es
 * opcional; si no se pasa, se devuelven todos.
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
