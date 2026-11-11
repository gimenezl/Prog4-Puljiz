/**
 * Puerto de salida: servicio de hash de contraseñas.
 *
 * Contrato:
 *   hashear(contrasena): Promise<string>
 *   verificar(contrasena, credencial): Promise<boolean>
 *
 * `hashear` recibe texto plano y devuelve un hash irreversible. `verificar`
 * nunca lanza por una credencial corrupta: devuelve false.
 *
 * Adaptadores:
 * - real:  src/infrastructure/adapters/out/security/bcrypt-password-hasher.js
 * - falso: src/infrastructure/adapters/out/security/in-memory-password-hasher.js
 */
export {};
