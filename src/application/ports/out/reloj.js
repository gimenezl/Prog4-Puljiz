/**
 * Puerto de salida: Reloj.
 *
 * Contrato:
 *   ahora(): Date
 *
 * Es la única fuente de tiempo del dominio. El cliente nunca informa la hora.
 *
 * Adaptadores:
 * - real:  src/infrastructure/adapters/out/clock/system-clock.js
 * - falso: src/infrastructure/adapters/out/clock/fixed-clock.js
 */
export {};
