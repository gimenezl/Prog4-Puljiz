import bcrypt from 'bcryptjs';

/**
 * Adaptador real del puerto de hash: bcrypt con costo configurable.
 * El costo mínimo de 12 encarece los ataques de fuerza bruta offline.
 */
export class BcryptPasswordHasher {
  #costo;

  constructor({ costo = 12 } = {}) {
    if (!Number.isInteger(costo) || costo < 4 || costo > 15) {
      throw new Error('El costo de bcrypt debe ser un entero entre 4 y 15.');
    }

    this.#costo = costo;
  }

  async hashear(contrasena) {
    return bcrypt.hash(contrasena, this.#costo);
  }

  async verificar(contrasena, credencial) {
    if (typeof credencial !== 'string' || credencial.length === 0) {
      return false;
    }

    try {
      return await bcrypt.compare(contrasena, credencial);
    } catch {
      return false;
    }
  }
}
