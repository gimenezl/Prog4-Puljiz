/**
 * Puerto de salida: emisión y verificación de tokens de sesión.
 *
 * Contrato:
 *   firmar({ usuarioId, rol }): Promise<{ token, expiraEn }>
 *   verificar(token): Promise<{ usuarioId, rol }>
 *
 * `verificar` rechaza tokens inválidos, manipulados o vencidos. La aplicación
 * no conoce el formato concreto del token.
 *
 * Adaptadores:
 * - real:  src/infrastructure/adapters/out/security/jwt-token-service.js
 * - falso: src/infrastructure/adapters/out/security/in-memory-token-service.js
 */
export {};
