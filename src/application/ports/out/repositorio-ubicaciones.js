/**
 * Puerto de salida: ubicación vigente de los choferes.
 *
 * Contrato:
 *   guardar(ubicacion, ejecutor?): Promise<void>
 *   buscarPorChoferId(choferId, ejecutor?): Promise<UbicacionChofer | null>
 *   verificarDisponibilidad(): Promise<boolean>
 *
 * `guardar` reemplaza la ubicación del chofer, salvo que la guardada sea más
 * reciente: así dos envíos que llegan desordenados no hacen retroceder al
 * chofer a una posición vieja.
 *
 * La búsqueda de choferes cercanos (RF-06) es otro puerto:
 * buscador-de-choferes-cercanos.js.
 *
 * Adaptadores:
 * - real:  src/infrastructure/adapters/out/persistence/postgres-ubicacion-repository.js
 * - falso: src/infrastructure/adapters/out/persistence/in-memory-ubicacion-repository.js
 */
export {};
