/**
 * Puerto de salida: repositorio de vehículos.
 *
 * Contrato:
 *   guardar(vehiculo, ejecutor?): Promise<void>
 *   buscarPorChoferId(choferId, ejecutor?): Promise<Vehiculo | null>
 *   verificarDisponibilidad(): Promise<boolean>
 *
 * `guardar` crea el vehículo del chofer o reemplaza sus datos si ya tenía uno
 * (un chofer tiene a lo sumo uno). Si la patente ya pertenece al vehículo de
 * otro chofer, lanza ErrorDeDominio('PATENTE_YA_REGISTRADA').
 *
 * Adaptadores:
 * - real:  src/infrastructure/adapters/out/persistence/postgres-vehiculo-repository.js
 * - falso: src/infrastructure/adapters/out/persistence/in-memory-vehiculo-repository.js
 */
export {};
