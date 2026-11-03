/**
 * Puerto de salida: generador de identificadores únicos.
 *
 * Contrato:
 *   generar(): string
 *
 * El dominio no genera IDs: los recibe ya creados para mantenerse puro y
 * testeable con un generador determinista.
 *
 * Adaptadores:
 * - real:  src/infrastructure/adapters/out/ids/crypto-id-generator.js
 * - falso: src/infrastructure/adapters/out/ids/in-memory-id-generator.js
 */
export {};
