import { randomUUID } from 'node:crypto';

/**
 * Adaptador falso del puerto de tokens para tests y ADAPTERS_MODE=fake.
 *
 * Usa tokens opacos en memoria en lugar de JWT. No sobrevive reinicios ni
 * comparte estado entre procesos; por eso nunca se usa en modo real.
 */
export class InMemoryTokenService {
  #tokens = new Map();
  #minutosDeVida;
  #reloj;

  constructor({ minutosDeVida = 60, reloj }) {
    this.#minutosDeVida = minutosDeVida;
    this.#reloj = reloj;
  }

  async firmar({ usuarioId, rol }) {
    const expiraEn = new Date(this.#reloj.ahora().getTime() + this.#minutosDeVida * 60_000);
    const token = randomUUID();

    this.#tokens.set(token, { usuarioId, rol, expiraEn });

    return { token, expiraEn: expiraEn.toISOString() };
  }

  async verificar(token) {
    const sesion = this.#tokens.get(token);

    if (!sesion || sesion.expiraEn.getTime() <= this.#reloj.ahora().getTime()) {
      this.#tokens.delete(token);
      throw new Error('El token no es válido o expiró.');
    }

    return { usuarioId: sesion.usuarioId, rol: sesion.rol };
  }
}
