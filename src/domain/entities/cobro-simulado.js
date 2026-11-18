import { ErrorDeDominio } from '../errors/error-de-dominio.js';

export const ESTADOS_COBRO = Object.freeze({
  PENDIENTE: 'PENDIENTE',
  COBRADO: 'COBRADO',
});

const ESTADOS_VALIDOS = new Set(Object.values(ESTADOS_COBRO));

function validarIdentificador(valor, mensaje) {
  if (typeof valor !== 'string' || valor.trim().length === 0) {
    throw new ErrorDeDominio('DATOS_INVALIDOS', mensaje);
  }

  return valor;
}

function validarMonto(valor) {
  if (!Number.isInteger(valor) || valor < 0) {
    throw new ErrorDeDominio('DATOS_INVALIDOS', 'El monto del cobro no es válido.');
  }

  return valor;
}

function validarFecha(valor, mensaje) {
  if (!(valor instanceof Date) || Number.isNaN(valor.getTime())) {
    throw new ErrorDeDominio('DATOS_INVALIDOS', mensaje);
  }

  return new Date(valor);
}

function validarReferencia(valor) {
  if (typeof valor !== 'string' || valor.trim().length === 0) {
    throw new ErrorDeDominio('DATOS_INVALIDOS', 'La referencia del cobro no es válida.');
  }

  return valor.trim();
}

/**
 * Cobro simulado de un viaje finalizado.
 *
 * Es único por viaje (`viajeId` es la clave natural) y solo puede pasar una
 * vez de `PENDIENTE` a `COBRADO`. `cobrar` es idempotente: si ya está cobrado
 * devuelve la misma instancia sin volver a ejecutar el efecto.
 */
export class CobroSimulado {
  #id;
  #viajeId;
  #montoCentavos;
  #estado;
  #creadoEn;
  #cobradoEn;
  #referencia;

  constructor({
    id,
    viajeId,
    montoCentavos,
    estado = ESTADOS_COBRO.PENDIENTE,
    creadoEn,
    cobradoEn = null,
    referencia = null,
  }) {
    this.#id = validarIdentificador(id, 'El identificador del cobro no es válido.');
    this.#viajeId = validarIdentificador(viajeId, 'El identificador del viaje no es válido.');
    this.#montoCentavos = validarMonto(montoCentavos);

    if (!ESTADOS_VALIDOS.has(estado)) {
      throw new ErrorDeDominio('DATOS_INVALIDOS', 'El estado del cobro no es válido.');
    }

    this.#estado = estado;
    this.#creadoEn = validarFecha(creadoEn, 'La fecha de creación del cobro no es válida.');
    this.#cobradoEn =
      cobradoEn === null ? null : validarFecha(cobradoEn, 'La fecha de cobro no es válida.');
    this.#referencia = referencia === null ? null : validarReferencia(referencia);

    if (estado === ESTADOS_COBRO.COBRADO) {
      if (this.#cobradoEn === null || this.#referencia === null) {
        throw new ErrorDeDominio(
          'DATOS_INVALIDOS',
          'Un cobro cobrado requiere fecha y referencia.',
        );
      }
    } else if (this.#cobradoEn !== null || this.#referencia !== null) {
      throw new ErrorDeDominio(
        'DATOS_INVALIDOS',
        'Un cobro pendiente no puede tener fecha de cobro ni referencia.',
      );
    }
  }

  get id() {
    return this.#id;
  }

  get viajeId() {
    return this.#viajeId;
  }

  get montoCentavos() {
    return this.#montoCentavos;
  }

  get estado() {
    return this.#estado;
  }

  get creadoEn() {
    return new Date(this.#creadoEn);
  }

  get cobradoEn() {
    return this.#cobradoEn ? new Date(this.#cobradoEn) : null;
  }

  get referencia() {
    return this.#referencia;
  }

  /** Confirma el cobro una sola vez. Un segundo intento devuelve este mismo. */
  cobrar(ahora, referencia) {
    if (this.#estado === ESTADOS_COBRO.COBRADO) {
      return this;
    }

    return new CobroSimulado({
      id: this.#id,
      viajeId: this.#viajeId,
      montoCentavos: this.#montoCentavos,
      estado: ESTADOS_COBRO.COBRADO,
      creadoEn: this.#creadoEn,
      cobradoEn: validarFecha(ahora, 'La fecha de cobro no es válida.'),
      referencia: validarReferencia(referencia),
    });
  }

  aVistaPublica() {
    return {
      id: this.#id,
      viajeId: this.#viajeId,
      montoCentavos: this.#montoCentavos,
      estado: this.#estado,
      creadoEn: this.#creadoEn.toISOString(),
      cobradoEn: this.#cobradoEn ? this.#cobradoEn.toISOString() : null,
      referencia: this.#referencia,
    };
  }

  toJSON() {
    return this.aVistaPublica();
  }
}
