/**
 * Puerto de salida: repositorio de tarifas versionadas.
 *
 * Contrato:
 *   crear(tarifa, ejecutor?): Promise<Tarifa>
 *   actualizar(tarifa, ejecutor?): Promise<Tarifa>
 *   buscarPorId(id, ejecutor?): Promise<Tarifa | null>
 *   listar(ejecutor?): Promise<Tarifa[]>
 *   vigente(ahora, ejecutor?): Promise<Tarifa | null>
 *   publicar(tarifa, ejecutor?): Promise<Tarifa>
 *   verificarDisponibilidad(): Promise<boolean>
 *
 * `publicar` recibe el borrador ya transformado por el dominio y recibe el
 * número de versión de la base (o del adaptador falso). Una publicada es
 * inmutable: intentar editarla o publicarla de nuevo lanza
 * ErrorDeDominio('VERSION_YA_PUBLICADA').
 *
 * Adaptadores:
 * - real:  src/infrastructure/adapters/out/persistence/postgres-tarifa-repository.js
 * - falso: src/infrastructure/adapters/out/persistence/in-memory-tarifa-repository.js
 */
export {};
