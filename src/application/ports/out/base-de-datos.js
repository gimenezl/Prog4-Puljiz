/**
 * Puerto de salida: conexión de base de datos.
 *
 * Contrato mínimo que necesita la infraestructura para verificar
 * disponibilidad y liberar recursos:
 *
 *   verificarConexion(): Promise<boolean>
 *   cerrar(): Promise<void>
 *
 * Los repositorios concretos se construyen sobre este adaptador. Las consultas
 * de negocio no viven aquí: viven en los repositorios de cada agregado.
 *
 * Adaptadores:
 * - real:  src/infrastructure/adapters/out/persistence/postgres-database.js
 * - falso: src/infrastructure/adapters/out/persistence/in-memory-database.js
 */
export {};
