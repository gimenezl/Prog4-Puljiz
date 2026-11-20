import { ErrorDeDominio } from '../errors/error-de-dominio.js';
import { PuntoGeografico } from '../value-objects/punto-geografico.js';

/**
 * Ubicación vigente de un chofer (docs/modelo.md §4.4): la última posición
 * recibida. Hay una por chofer y se reemplaza con cada envío.
 *
 * `actualizadaEn` es el instante de recepción en el servidor, nunca la hora
 * que informe el cliente.
 */
export class UbicacionChofer {
  #choferId;
  #punto;
  #actualizadaEn;

  constructor({ choferId, punto, actualizadaEn }) {
    if (typeof choferId !== 'string' || choferId.trim().length === 0) {
      throw new ErrorDeDominio('DATOS_INVALIDOS', 'El identificador del chofer no es válido.');
    }

    if (!(actualizadaEn instanceof Date) || Number.isNaN(actualizadaEn.getTime())) {
      throw new ErrorDeDominio('DATOS_INVALIDOS', 'La fecha de la ubicación no es válida.');
    }

    this.#choferId = choferId;
    this.#punto = punto instanceof PuntoGeografico ? punto : new PuntoGeografico(punto ?? {});
    this.#actualizadaEn = new Date(actualizadaEn);
  }

  get choferId() {
    return this.#choferId;
  }

  get punto() {
    return this.#punto;
  }

  get actualizadaEn() {
    return new Date(this.#actualizadaEn);
  }

  /**
   * Una ubicación sirve para ofrecer viajes mientras su antigüedad sea menor
   * que la vigencia configurada. El límite es exclusivo, como los vencimientos
   * del modelo (§9.1).
   */
  estaVigente(ahora, vigenciaMs) {
    return ahora.getTime() - this.#actualizadaEn.getTime() < vigenciaMs;
  }

  aVistaPublica() {
    return {
      choferId: this.#choferId,
      punto: this.#punto.aJSON(),
      actualizadaEn: this.#actualizadaEn.toISOString(),
    };
  }

  toJSON() {
    return this.aVistaPublica();
  }
}
