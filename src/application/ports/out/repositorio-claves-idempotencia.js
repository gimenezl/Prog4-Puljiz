/**
 * Puerto de salida: repositorio de claves de idempotencia.
 *
 * Contrato:
 *   buscar(alcance, clave, ejecutor?): Promise<ClaveDeIdempotencia | null>
 *   crear(registro, ejecutor?): Promise<boolean>
 *   eliminar(alcance, clave, ejecutor?): Promise<void>
 *   verificarDisponibilidad(): Promise<boolean>
 *
 * `crear` devuelve false cuando ya existe el par (alcance, clave). La clave se
 * guarda en la misma transacción que el efecto que protege. La respuesta
 * original se conserva para devolverla tal cual en los reintentos.
 *
 * Adaptadores:
 * - real:  src/infrastructure/adapters/out/persistence/postgres-idempotency-repository.js
 * - falso: src/infrastructure/adapters/out/persistence/in-memory-idempotency-repository.js
 */
export {};
