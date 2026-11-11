import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Adaptador falso del puerto de hash para tests y ADAPTERS_MODE=fake.
 *
 * NO es seguro para producción: usa SHA-256 sin sal ni costo de trabajo. Su
 * único objetivo es que los tests de aplicación sean rápidos y deterministas.
 */
export class InMemoryPasswordHasher {
  #hashear(contrasena) {
    return `fake$${createHash('sha256').update(contrasena, 'utf8').digest('hex')}`;
  }

  async hashear(contrasena) {
    return this.#hashear(contrasena);
  }

  async verificar(contrasena, credencial) {
    if (typeof credencial !== 'string' || credencial.length === 0) {
      return false;
    }

    const esperado = Buffer.from(this.#hashear(contrasena), 'utf8');
    const almacenado = Buffer.from(credencial, 'utf8');

    return esperado.length === almacenado.length && timingSafeEqual(esperado, almacenado);
  }
}
