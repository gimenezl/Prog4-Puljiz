/**
 * Puerto de salida: repositorio del agregado Usuario.
 *
 * Contrato:
 *   buscarPorId(id, ejecutor?): Promise<Usuario | null>
 *   buscarPorEmail(email, ejecutor?): Promise<Usuario | null>
 *   crear(usuario, ejecutor?): Promise<void>
 *   actualizar(usuario, ejecutor?): Promise<void>
 *   verificarDisponibilidad(): Promise<boolean>
 *
 * `crear` debe hacer cumplir la unicidad del email sin distinguir mayúsculas.
 * Si ya existe, lanza ErrorDeDominio('EMAIL_YA_REGISTRADO').
 *
 * `ejecutor` es el contexto opaco de la unidad de trabajo. Los adaptadores lo
 * usan para participar de la misma transacción que el resto de las escrituras.
 *
 * Adaptadores:
 * - real:  src/infrastructure/adapters/out/persistence/postgres-user-repository.js
 * - falso: src/infrastructure/adapters/out/persistence/in-memory-user-repository.js
 */
export {};
