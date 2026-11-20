/**
 * Puerto de salida: repositorio de cotizaciones.
 *
 * Contrato:
 *   crear(cotizacion, ejecutor?): Promise<Cotizacion>
 *   buscarPorId(id, ejecutor?): Promise<Cotizacion | null>
 *   ultimaPorZona(zonaId, ejecutor?): Promise<Cotizacion | null>
 *   listarPorPasajero(pasajeroId, ejecutor?): Promise<Cotizacion[]>
 *   marcarEstado(id, estado, ahora, ejecutor?): Promise<boolean>
 *   verificarDisponibilidad(): Promise<boolean>
 *
 * `marcarEstado` es una escritura condicional sobre el estado VIGENTE: devuelve
 * true si cambió la fila y false si otra operación ya la confirmó o venció.
 * Ningún método permite modificar los atributos de la foto (I11).
 *
 * Adaptadores:
 * - real:  src/infrastructure/adapters/out/persistence/postgres-cotizacion-repository.js
 * - falso: src/infrastructure/adapters/out/persistence/in-memory-cotizacion-repository.js
 */
export {};
