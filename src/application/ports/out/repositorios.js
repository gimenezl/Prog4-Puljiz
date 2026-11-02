/**
 * Puerto de salida: Repositorios.
 *
 * Cada agregado tiene su repositorio. Las operaciones que resuelven carreras
 * exponen escrituras condicionales (compare-and-set), por ejemplo:
 *
 *   transicionar(id, estadoEsperado, estadoNuevo, cambios): Promise<boolean>
 *
 * Devuelve true solo si la fila cumplía la condición y fue actualizada.
 *
 * Repositorios previstos por el modelo de dominio:
 * - Usuarios
 * - Choferes
 * - Vehiculos
 * - Ubicaciones
 * - ZonasDeDemanda
 * - ReglasDeMultiplicador
 * - Tarifas
 * - Cotizaciones
 * - Viajes
 * - Ofertas
 * - CobrosSimulados
 * - ClavesDeIdempotencia
 *
 * Las implementaciones reales irán en infrastructure/adapters/out/persistence.
 * Las implementaciones en memoria irán en el mismo árbol con sufijo -memory.
 */
export {};
