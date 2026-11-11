import { randomUUID } from 'node:crypto';

/**
 * Adaptador real del puerto GeneradorDeIds: UUID v4 generado por el servidor.
 */
export class CryptoIdGenerator {
  generar() {
    return randomUUID();
  }
}
