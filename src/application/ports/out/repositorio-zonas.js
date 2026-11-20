/**
 * Puerto de salida: repositorio de zonas de demanda.
 *
 * Contrato:
 *   crear(zona, ejecutor?): Promise<ZonaDeDemanda>
 *   buscarPorId(id, ejecutor?): Promise<ZonaDeDemanda | null>
 *   listar({ activa? }, ejecutor?): Promise<ZonaDeDemanda[]>
 *   zonaDe(punto, ahora, ejecutor?): Promise<ZonaDeDemanda | null>
 *   actualizar(zona, ejecutor?): Promise<ZonaDeDemanda>
 *   verificarDisponibilidad(): Promise<boolean>
 *
 * Una zona nunca se elimina: se desactiva. Dos zonas activas no pueden
 * solaparse; el adaptador traduce la violación a ErrorDeDominio(
 * 'ZONAS_SUPERPUESTAS').
 *
 * Adaptadores:
 * - real:  src/infrastructure/adapters/out/persistence/postgres-zona-repository.js
 * - falso: src/infrastructure/adapters/out/persistence/in-memory-zona-repository.js
 */
export {};
