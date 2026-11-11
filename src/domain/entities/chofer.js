import { ErrorDeDominio } from '../errors/error-de-dominio.js';

export const ESTADOS_CHOFER = Object.freeze({
  INHABILITADO: 'INHABILITADO',
  NO_DISPONIBLE: 'NO_DISPONIBLE',
  DISPONIBLE: 'DISPONIBLE',
  OCUPADO: 'OCUPADO',
});

function validarIdentificador(valor, mensaje) {
  if (typeof valor !== 'string' || valor.trim().length === 0) {
    throw new ErrorDeDominio('DATOS_INVALIDOS', mensaje);
  }

  return valor;
}

function validarBooleano(valor, mensaje) {
  if (typeof valor !== 'boolean') {
    throw new ErrorDeDominio('DATOS_INVALIDOS', mensaje);
  }

  return valor;
}

/**
 * Perfil operativo de un usuario con rol CHOFER.
 *
 * `habilitado` lo decide un administrador; `disponible` lo declara el chofer.
 * `viajeActivoId` es la única fuente de verdad sobre si está ocupado.
 */
export class Chofer {
  #usuarioId;
  #habilitado;
  #disponible;
  #viajeActivoId;

  constructor({ usuarioId, habilitado = false, disponible = false, viajeActivoId = null }) {
    this.#usuarioId = validarIdentificador(usuarioId, 'El identificador del chofer no es válido.');
    this.#habilitado = validarBooleano(habilitado, 'La habilitación del chofer no es válida.');
    this.#disponible = validarBooleano(disponible, 'La disponibilidad del chofer no es válida.');

    if (this.#disponible && !this.#habilitado) {
      throw new ErrorDeDominio(
        'DATOS_INVALIDOS',
        'Un chofer no habilitado no puede declararse disponible.',
      );
    }

    if (viajeActivoId !== null) {
      this.#viajeActivoId = validarIdentificador(
        viajeActivoId,
        'El viaje activo del chofer no es válido.',
      );
    } else {
      this.#viajeActivoId = null;
    }
  }

  get usuarioId() {
    return this.#usuarioId;
  }

  get habilitado() {
    return this.#habilitado;
  }

  get disponible() {
    return this.#disponible;
  }

  get viajeActivoId() {
    return this.#viajeActivoId;
  }

  /** Estado compuesto que se muestra en la API. */
  get estado() {
    if (this.#viajeActivoId !== null) return ESTADOS_CHOFER.OCUPADO;
    if (!this.#habilitado) return ESTADOS_CHOFER.INHABILITADO;
    if (!this.#disponible) return ESTADOS_CHOFER.NO_DISPONIBLE;
    return ESTADOS_CHOFER.DISPONIBLE;
  }

  estaElegible() {
    return this.#habilitado && this.#disponible && this.#viajeActivoId === null;
  }

  /** Devuelve una copia ocupada con el viaje indicado. */
  ocupar(viajeId) {
    if (this.#viajeActivoId !== null) {
      throw new ErrorDeDominio('CHOFER_OCUPADO', 'El chofer ya tiene un viaje activo.');
    }

    if (!this.#habilitado || !this.#disponible) {
      throw new ErrorDeDominio(
        'CHOFER_NO_ELEGIBLE',
        'El chofer no está habilitado y disponible para aceptar viajes.',
      );
    }

    return new Chofer({
      usuarioId: this.#usuarioId,
      habilitado: this.#habilitado,
      disponible: this.#disponible,
      viajeActivoId: validarIdentificador(viajeId, 'El viaje a asignar no es válido.'),
    });
  }

  /** Libera al chofer solo si el viaje activo es el indicado. */
  liberar(viajeId) {
    if (this.#viajeActivoId !== viajeId) {
      return this;
    }

    return new Chofer({
      usuarioId: this.#usuarioId,
      habilitado: this.#habilitado,
      disponible: this.#disponible,
      viajeActivoId: null,
    });
  }

  conDisponibilidad(disponible) {
    if (disponible && !this.#habilitado) {
      throw new ErrorDeDominio(
        'CHOFER_NO_ELEGIBLE',
        'El chofer debe estar habilitado antes de declararse disponible.',
      );
    }

    return new Chofer({
      usuarioId: this.#usuarioId,
      habilitado: this.#habilitado,
      disponible,
      viajeActivoId: this.#viajeActivoId,
    });
  }

  conHabilitacion(habilitado) {
    return new Chofer({
      usuarioId: this.#usuarioId,
      habilitado,
      disponible: habilitado ? this.#disponible : false,
      viajeActivoId: this.#viajeActivoId,
    });
  }

  aVistaPublica() {
    return {
      usuarioId: this.#usuarioId,
      habilitado: this.#habilitado,
      disponible: this.#disponible,
      viajeActivoId: this.#viajeActivoId,
      estado: this.estado,
    };
  }

  toJSON() {
    return this.aVistaPublica();
  }
}
