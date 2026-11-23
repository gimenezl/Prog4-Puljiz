/**
 * Puerto de salida: BuscadorDeChoferesCercanos (RF-06, ADR-0006).
 *
 * Contrato:
 *   buscar({ origen, radioM, limite, ahora, vigenciaUbicacionMs }, ejecutor?)
 *     : Promise<Array<{ choferId: string, distanciaM: number }>>
 *
 * Devuelve los choferes elegibles más cercanos al origen, ordenados por
 * distancia ascendente y como máximo `limite`. Elegible significa habilitado,
 * disponible, libre (sin viaje activo) y con una ubicación recibida hace menos
 * de `vigenciaUbicacionMs` respecto de `ahora`. `distanciaM` está en metros
 * enteros.
 *
 * El adaptador real filtra y ordena en la base con un índice espacial: nunca
 * trae todos los choferes a JavaScript.
 *
 * Adaptadores:
 * - real:  src/infrastructure/adapters/out/geografia/postgis-buscador-de-choferes.js
 * - falso: src/infrastructure/adapters/out/geografia/en-memoria-buscador-de-choferes.js
 */
export {};
