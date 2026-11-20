/**
 * Puerto de salida: repositorio de reglas de multiplicador versionadas.
 *
 * Contrato:
 *   crear(regla, ejecutor?): Promise<ReglaDeMultiplicador>
 *   actualizar(regla, ejecutor?): Promise<ReglaDeMultiplicador>
 *   buscarPorId(id, ejecutor?): Promise<ReglaDeMultiplicador | null>
 *   listar(ejecutor?): Promise<ReglaDeMultiplicador[]>
 *   vigente(ahora, ejecutor?): Promise<ReglaDeMultiplicador | null>
 *   publicar(regla, ejecutor?): Promise<ReglaDeMultiplicador>
 *   verificarDisponibilidad(): Promise<boolean>
 *
 * La vigente es la PUBLICADA con mayor versión entre las que tienen
 * vigenteDesde <= ahora. Si no hay ninguna, el caso de uso responde
 * ErrorDeDominio('CONFIGURACION_INCOMPLETA').
 *
 * Adaptadores:
 * - real:  src/infrastructure/adapters/out/persistence/postgres-regla-repository.js
 * - falso: src/infrastructure/adapters/out/persistence/in-memory-regla-repository.js
 */
export {};
